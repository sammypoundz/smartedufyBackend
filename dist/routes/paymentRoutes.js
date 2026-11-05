"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// BIA CONNECT payment routes — /api/payments (school-facing)
//                    + webhook — POST /api/v1/webhooks/bia (public)
// Uses the standard school authMiddleware/tenantMiddleware stack in
// server.ts, so req.user.schoolId is always present on protected routes.
// ============================================================
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const biaPaymentService_1 = require("../services/biaPaymentService");
const biaService_1 = require("../services/biaService");
const biaPaymentService_2 = require("../services/biaPaymentService");
const platformSettingsService_1 = require("../services/platformSettingsService");
const router = (0, express_1.Router)();
const asyncRoute = (fn) => (req, res) => {
    fn(req, res).catch((e) => {
        console.error("payment route error:", e.message);
        res
            .status(e.status || 500)
            .json({ error: e.message || "Internal server error" });
    });
};
// ---------- in-memory rate limiter for checkout initialization ----------
const initBuckets = new Map();
const INIT_WINDOW_MS = 60000;
const INIT_MAX = 5; // 5 checkouts per minute per user is generous
function rateLimitInit(userId) {
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
router.post("/bia/initialize", asyncRoute(async (req, res) => {
    if (!req.user?.id)
        return res.status(401).json({ error: "Unauthorized" });
    if (!rateLimitInit(req.user.id)) {
        return res
            .status(429)
            .json({ error: "Too many payment attempts — wait a minute and retry" });
    }
    const result = await (0, biaPaymentService_1.startTokenCheckout)({
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
}));
// ---------- GET /api/payments/token-packages ----------
router.get("/token-packages", asyncRoute(async (_req, res) => {
    const pkgs = await prisma_1.prisma.tokenPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, tokens: true, price: true },
    });
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    res.json({
        biaEnabled: (0, biaService_1.biaConfigured)(),
        tokenPrice,
        // Processing fee charged on every token payment (0.9% of the base
        // price), so the purchase UI can show an exact breakdown.
        feeRate: biaPaymentService_2.TOKEN_FEE_RATE,
        packages: pkgs,
    });
}));
// ---------- GET /api/payments/token-history ----------
router.get("/token-history", asyncRoute(async (req, res) => {
    if (!req.user?.schoolId)
        return res.status(401).json({ error: "Unauthorized" });
    const limit = Math.min(200, Number(req.query.limit) || 50);
    res.json(await (0, biaPaymentService_1.schoolPaymentHistory)(req.user.schoolId, limit));
}));
// ---------- GET /api/payments/:reference/status ----------
// Authenticated school user checking their own payment. Optionally triggers a
// server-side BIA verification (and fulfillment if verified SUCCESS). The
// frontend NEVER marks payment successful itself.
router.get("/:reference/status", asyncRoute(async (req, res) => {
    if (!req.user?.schoolId)
        return res.status(401).json({ error: "Unauthorized" });
    const txn = await (0, biaPaymentService_1.getTransactionForSchool)(String(req.params.reference), req.user.schoolId);
    // Poll-verify pending transactions that have a checkout session; cap the
    // work so hammering refresh can't spam BIA (only verify every 5+ seconds).
    let reconcile = null;
    const recentlyVerified = txn.updatedAt && Date.now() - new Date(txn.updatedAt).getTime() < 5000;
    if (txn.status === "PENDING" && txn.biaReference && !recentlyVerified) {
        reconcile = await (0, biaPaymentService_1.reconcileTransaction)(txn.id, "STATUS_POLL");
    }
    const current = reconcile && reconcile.status
        ? await prisma_1.prisma.biaPaymentTransaction.findUnique({
            where: { id: txn.id },
        })
        : txn;
    res.json({
        reference: current.internalReference,
        biaReference: current.biaReference,
        status: current.status,
        amount: current.amount,
        currency: current.currency,
        tokenQuantity: current.tokenQuantity,
        fulfilled: current.fulfilled,
        paidAt: current.paidAt,
        checkoutExpiresAt: current.checkoutExpiresAt,
        createdAt: current.createdAt,
        message: reconcile?.message,
    });
}));
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
router.post("/webhooks/bia", asyncRoute(async (req, res) => {
    const body = req.body || {};
    // Accept the common shapes: data.reference / data.merchantReference / top-level.
    const ref = body?.data?.reference ||
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
    const txn = await prisma_1.prisma.biaPaymentTransaction.findFirst({
        where: { OR: [{ internalReference: ref }, { biaReference: ref }] },
        select: { id: true, internalReference: true },
    });
    if (!txn)
        return res.status(200).json({ received: true, acted: false });
    const result = await (0, biaPaymentService_1.reconcileTransaction)(txn.id, "WEBHOOK").catch((e) => {
        console.error("webhook reconcile failed:", e?.message);
        return null;
    });
    // Always 200 once we have processed/queued the verification, so BIA
    // doesn't hammer retries on transient DB errors (we reconcile on poll too).
    res.status(200).json({
        received: true,
        acted: Boolean(result?.fulfilled),
        status: result?.status || "PENDING",
    });
}));
exports.default = router;
