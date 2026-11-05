"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// Paystack payment routes — /api/payments (school-facing)
//            + webhook — POST /api/v1/webhooks/paystack (public)
// Uses the standard school authMiddleware/tenantMiddleware stack in
// server.ts, so req.user.schoolId is always present on protected routes.
// ============================================================
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../config/prisma");
const biaPaymentService_1 = require("../services/biaPaymentService");
const paystackService_1 = require("../services/paystackService");
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
// ---------- POST /api/payments/paystack/initialize ----------
router.post("/paystack/initialize", asyncRoute(async (req, res) => {
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
        biaEnabled: (0, paystackService_1.paystackConfigured)(),
        tokenPrice,
        // No processing fee is charged — schools pay exactly the base price.
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
    // Reconcile pending transactions AND unfulfilled REVERSED ones (a REVERSED
    // marking can come from a transient amount-mismatch, e.g. the bank-transfer
    // fee overage — re-verification gives it a chance to fulfil correctly).
    const reconcilable = (txn.status === "PENDING" ||
        (txn.status === "REVERSED" && !txn.fulfilled)) &&
        txn.biaReference;
    if (reconcilable && !recentlyVerified) {
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
// WEBHOOK — POST /api/v1/webhooks/paystack
// PUBLIC route (mounted before auth middleware in server.ts).
//
// SECURITY: the webhook body is verified against the x-paystack-signature
// HMAC-SHA512 header using PAYSTACK_SECRET_KEY. A forged request cannot
// credit tokens — the handler only uses the reference as a *pointer* to
// re-verify server-side with Paystack's own verify endpoint
// (reconcileTransaction).
// ============================================================
router.post("/webhooks/paystack", asyncRoute(async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = String(req.headers["x-paystack-signature"] || "");
    // Raw body captured by the global express.json verify hook in server.ts.
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!secret || !signature) {
        return res.status(401).json({ error: "Webhook not configured" });
    }
    const expected = crypto_1.default
        .createHmac("sha512", secret)
        .update(raw)
        .digest("hex");
    const ok = signature.length === expected.length &&
        crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) {
        return res.status(401).json({ error: "Invalid signature" });
    }
    const event = req.body || {};
    const data = event?.data || {};
    const ref = data.reference;
    if (event?.event !== "charge.success" || !ref) {
        // Other events (transfer.*, refund.*) are ignored for now.
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
    // Always 200 once processed/queued so Paystack doesn't hammer retries on
    // transient DB errors (we reconcile on poll too).
    res.status(200).json({
        received: true,
        acted: Boolean(result?.fulfilled),
        status: result?.status || "PENDING",
    });
}));
exports.default = router;
