// ============================================================
// BIA CONNECT payment routes — /api/payments (school-facing)
//                    + webhook — POST /api/v1/webhooks/bia (public)
// Uses the standard school authMiddleware/tenantMiddleware stack in
// server.ts, so req.user.schoolId is always present on protected routes.
// ============================================================
import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware } from "../middleware/auth";
import {
  startTokenCheckout,
  getTransactionForSchool,
  reconcileTransaction,
  schoolPaymentHistory,
  PaymentError,
} from "../services/biaPaymentService";
import { biaConfigured } from "../services/biaService";
import { TOKEN_FEE_RATE } from "../services/biaPaymentService";
import { getTokenPrice } from "../services/platformSettingsService";
import { logPlatformActivity } from "../services/platformAuditService";

const router = Router();

const asyncRoute =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: any, res: Response) => {
    fn(req, res).catch((e: any) => {
      console.error("payment route error:", e.message);
      res
        .status(e.status || 500)
        .json({ error: e.message || "Internal server error" });
    });
  };

// ---------- in-memory rate limiter for checkout initialization ----------
const initBuckets = new Map<string, { count: number; resetAt: number }>();
const INIT_WINDOW_MS = 60_000;
const INIT_MAX = 5; // 5 checkouts per minute per user is generous
function rateLimitInit(userId: string): boolean {
  const now = Date.now();
  const bucket = initBuckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    initBuckets.set(userId, { count: 1, resetAt: now + INIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= INIT_MAX;
}

// ---------- POST /api/payments/bia/initialize ----------
router.post(
  "/bia/initialize",
  asyncRoute(async (req: any, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    if (!rateLimitInit(req.user.id)) {
      return res
        .status(429)
        .json({ error: "Too many payment attempts — wait a minute and retry" });
    }
    const result = await startTokenCheckout({
      schoolId: req.user.schoolId,
      userId: req.user.id,
      body: req.body,
      ip: req.ip,
    });
    // Return only what the browser needs (no internal ids beyond the ref).
    res.status(201).json({
      reference: result.checkout.reference,
      authorizationUrl: result.checkout.authorizationUrl,
      amount: result.checkout.amount,
      currency: result.checkout.currency,
      tokenQuantity: result.checkout.tokenQuantity,
      expiresAt: result.checkout.expiresAt,
    });
  }),
);

// ---------- GET /api/payments/token-packages ----------
router.get(
  "/token-packages",
  asyncRoute(async (_req: any, res: Response) => {
    const pkgs = await prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, tokens: true, price: true },
    });
    const tokenPrice = await getTokenPrice();
    res.json({
      biaEnabled: biaConfigured(),
      tokenPrice,
      // Processing fee charged on every token payment (0.9% of the base
      // price), so the purchase UI can show an exact breakdown.
      feeRate: TOKEN_FEE_RATE,
      packages: pkgs,
    });
  }),
);

// ---------- GET /api/payments/token-history ----------
router.get(
  "/token-history",
  asyncRoute(async (req: any, res: Response) => {
    if (!req.user?.schoolId)
      return res.status(401).json({ error: "Unauthorized" });
    const limit = Math.min(200, Number(req.query.limit) || 50);
    res.json(await schoolPaymentHistory(req.user.schoolId, limit));
  }),
);

// ---------- GET /api/payments/:reference/status ----------
// Authenticated school user checking their own payment. Optionally triggers a
// server-side BIA verification (and fulfillment if verified SUCCESS). The
// frontend NEVER marks payment successful itself.
router.get(
  "/:reference/status",
  asyncRoute(async (req: any, res: Response) => {
    if (!req.user?.schoolId)
      return res.status(401).json({ error: "Unauthorized" });
    const txn = await getTransactionForSchool(
      String(req.params.reference),
      req.user.schoolId,
    );

    // Poll-verify pending transactions that have a checkout session; cap the
    // work so hammering refresh can't spam BIA (only verify every 5+ seconds).
    let reconcile: Awaited<ReturnType<typeof reconcileTransaction>> | null =
      null;
    const recentlyVerified =
      txn.updatedAt && Date.now() - new Date(txn.updatedAt).getTime() < 5_000;
    if (txn.status === "PENDING" && txn.biaReference && !recentlyVerified) {
      reconcile = await reconcileTransaction(txn.id, "STATUS_POLL");
    }

    const current =
      reconcile && reconcile.status
        ? await prisma.biaPaymentTransaction.findUnique({
            where: { id: txn.id },
          })
        : txn;

    res.json({
      reference: current!.internalReference,
      biaReference: current!.biaReference,
      status: current!.status,
      amount: current!.amount,
      currency: current!.currency,
      tokenQuantity: current!.tokenQuantity,
      fulfilled: current!.fulfilled,
      paidAt: current!.paidAt,
      checkoutExpiresAt: current!.checkoutExpiresAt,
      createdAt: current!.createdAt,
      message: reconcile?.message,
    });
  }),
);

// ============================================================
// WEBHOOK — POST /api/v1/webhooks/bia
// PUBLIC route (mounted before auth middleware in server.ts).
//
// IMPORTANT — webhook signature verification is NOT implemented yet: the BIA
// checkout documentation provided so far does not include the webhook payload
// format or the signature scheme. BIA_WEBHOOK_SECRET is reserved in env. Do
// NOT trust the webhook body alone: this handler only ever uses the payload's
// reference as a *pointer* to re-verify server-side with BIA's own verify
// endpoint (reconcileTransaction). A forged webhook can therefore do nothing
// more than trigger a legitimate verification — it cannot credit tokens.
// ============================================================
router.post(
  "/webhooks/bia",
  asyncRoute(async (req: Request, res: Response) => {
    const body: any = req.body || {};
    // Accept the common shapes: data.reference / data.merchantReference / top-level.
    const ref: string | undefined =
      body?.data?.reference ||
      body?.data?.merchantReference ||
      body?.reference ||
      body?.merchantReference;

    if (process.env.BIA_WEBHOOK_SECRET) {
      // Placeholder — when BIA documents the signature header/algorithm,
      // verify req.headers here and 401 on failure BEFORE any processing.
      // (Intentionally not inventing a scheme.)
    }

    if (!ref || typeof ref !== "string") {
      // Acknowledge so BIA doesn't retry malformed deliveries forever.
      return res.status(200).json({ received: true, acted: false });
    }

    const txn = await prisma.biaPaymentTransaction.findFirst({
      where: { OR: [{ internalReference: ref }, { biaReference: ref }] },
      select: { id: true, internalReference: true },
    });
    if (!txn) return res.status(200).json({ received: true, acted: false });

    const result = await reconcileTransaction(txn.id, "WEBHOOK").catch(
      (e: any) => {
        console.error("webhook reconcile failed:", e?.message);
        return null;
      },
    );

    // Always 200 once we have processed/queued the verification, so BIA
    // doesn't hammer retries on transient DB errors (we reconcile on poll too).
    res.status(200).json({
      received: true,
      acted: Boolean(result?.fulfilled),
      status: result?.status || "PENDING",
    });
  }),
);

export default router;
