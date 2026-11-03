"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE 7 — School-facing Edufy AI token endpoints (mounted at /api/tokens).
// Lets a school admin see their own wallet & ledger, buy tokens (a PURCHASE
// request is recorded and credited immediately for TRANSFER/USSD flows where
// the platform finance admin later confirms the bank transfer), and get
// pricing for the purchase UI.
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tokenWalletService_1 = require("../services/tokenWalletService");
const platformSettingsService_1 = require("../services/platformSettingsService");
const platformNotificationService_1 = require("../services/platformNotificationService");
const platformAuditService_1 = require("../services/platformAuditService");
const router = (0, express_1.Router)();
const asyncRoute = (fn) => (req, res) => {
    fn(req, res).catch((e) => {
        console.error("token route error:", e.message);
        res
            .status(e.status || 500)
            .json({ error: e.message || "Internal server error" });
    });
};
/** Current wallet + recent ledger for the signed-in school admin. */
router.get("/wallet", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), asyncRoute(async (req, res) => {
    const schoolId = req.user.schoolId;
    const [wallet, ledger, tokenPrice] = await Promise.all([
        tokenWalletService_1.tokenWalletService.getWallet(schoolId),
        tokenWalletService_1.tokenWalletService.ledger(schoolId, 30),
        (0, platformSettingsService_1.getTokenPrice)(),
    ]);
    res.json({
        wallet: {
            balance: wallet.balance,
            reserved: wallet.reserved,
            lifetimePurchased: wallet.lifetimePurchased,
            lifetimeConsumed: wallet.lifetimeConsumed,
        },
        tokenPrice,
        ledger,
    });
}));
/** Public pricing for the purchase UI (any signed-in school user). */
router.get("/pricing", auth_1.authMiddleware, asyncRoute(async (_req, res) => {
    res.json({ tokenPrice: await (0, platformSettingsService_1.getTokenPrice)() });
}));
// Token packages offered to schools (from the configurable TokenPackage
// catalogue the super admin manages; falls back to nothing if empty).
router.get("/packages", auth_1.authMiddleware, asyncRoute(async (_req, res) => {
    const pkgs = await prisma_1.prisma.tokenPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
    });
    res.json(pkgs.map((p) => ({
        name: p.name,
        tokens: p.tokens,
        priceNgn: p.price,
    })));
}));
/**
 * Purchase flow:
 *  1. School picks a package (or custom amount) → POST /tokens/purchase with
 *     their preferred payment method + a bank-transfer reference.
 *  2. The wallet is credited immediately (tokens are usable right away) and a
 *     TOKEN_PURCHASE request is raised to the platform so FINANCE_ADMIN can
 *     verify the matching bank transfer. Unverified purchases show as
 *     "pending verification" on the school's ledger.
 *  3. If the transfer never lands, the platform can reverse it via
 *     POST /api/platform/wallets/:schoolId/adjust (negative, with a reason).
 */
router.post("/purchase", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        tokens: zod_1.z.number().int().positive().max(100000),
        method: zod_1.z.enum(["TRANSFER", "USSD", "CARD"]).default("TRANSFER"),
        reference: zod_1.z.string().min(3).max(100).optional(),
    });
    const data = schema.parse(req.body);
    const schoolId = req.user.schoolId;
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
    });
    if (!school)
        return res.status(404).json({ error: "School not found" });
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    const ref = data.reference ||
        `TOK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await tokenWalletService_1.tokenWalletService.purchase(schoolId, data.tokens, ref, {
        note: `Purchase via ${data.method} — ${data.tokens} tokens @ ₦${tokenPrice}`,
        metadata: {
            method: data.method,
            unitPrice: tokenPrice,
            byUserId: req.user.id,
        },
    });
    if (result.duplicate)
        return res.status(409).json({ error: "This reference was already used" });
    // Tell the platform finance team to verify the payment.
    await (0, platformNotificationService_1.notifyPlatform)({
        type: "TOKEN_PURCHASE",
        title: "School token purchase — verify payment",
        message: `${school.name} bought ${data.tokens.toLocaleString()} tokens (₦${(data.tokens * tokenPrice).toLocaleString()}) via ${data.method}. Ref: ${ref}. Verify the bank transfer.`,
        schoolId,
        severity: "INFO",
        metadata: { tokens: data.tokens, reference: ref, method: data.method },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.user.id,
        actorName: school.name + " admin",
        action: "WALLET_PURCHASE_REQUEST",
        targetType: "TokenWallet",
        targetId: schoolId,
        description: `${school.name} purchased ${data.tokens} tokens (₦${data.tokens * tokenPrice}) ref ${ref}`,
        ipAddress: req.ip,
    });
    res.status(201).json({
        tokens: data.tokens,
        amountNgn: data.tokens * tokenPrice,
        reference: ref,
        wallet: result.wallet,
        entry: result.entry,
    });
}));
exports.default = router;
// ============================================================
// SCHOOL BILLING — /api/tokens/billing/* (school's own invoices)
// ============================================================
/** This school's subscription invoices (paid & pending). */
router.get("/billing/invoices", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), asyncRoute(async (req, res) => {
    const schoolId = req.user.schoolId;
    const invoices = await prisma_1.prisma.invoice.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json(invoices);
}));
/** Billing history events for this school (allocation/renewal audit trail). */
router.get("/billing/events", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), asyncRoute(async (req, res) => {
    const schoolId = req.user.schoolId;
    const events = await prisma_1.prisma.billingEvent.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    res.json(events);
}));
