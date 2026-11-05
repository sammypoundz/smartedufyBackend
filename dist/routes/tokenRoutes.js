"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE 7 — School-facing Edufy AI token endpoints (mounted at /api/tokens).
// Lets a school admin see their own wallet & ledger, buy tokens (a PURCHASE
// request is recorded and credited immediately for TRANSFER/USSD flows where
// the platform finance admin later confirms the bank transfer), and get
// pricing for the purchase UI.
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tokenWalletService_1 = require("../services/tokenWalletService");
const platformSettingsService_1 = require("../services/platformSettingsService");
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
 * DISABLED — this legacy endpoint credited tokens instantly on trust and only
 * asked the finance team to verify the bank transfer afterwards. With the BIA
 * CONNECT gateway live, that flow would allow crediting without a verified
 * payment. All token purchases now go through POST /api/payments/bia/initialize
 * (verified server-side before crediting). Platform admins can still credit
 * wallets manually via POST /api/platform/wallets/:schoolId/purchase.
 */
router.post("/purchase", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), asyncRoute(async (_req, res) => {
    res.status(410).json({
        error: "Manual token purchase has been replaced by secure online payment. Use the Top up button in Edufy AI → Tokens, which pays via BIA CONNECT.",
    });
}));
/* Original trust-based flow (kept for reference, no longer routed):
router.post(
  "/purchase",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL"]),
  asyncRoute(async (req: AuthRequest, res: Response) => {
    const schema = z.object({
      tokens: z.number().int().positive().max(100000),
      method: z.enum(["TRANSFER", "USSD", "CARD"]).default("TRANSFER"),
      reference: z.string().min(3).max(100).optional(),
    });
    const data = schema.parse(req.body);
    const schoolId = req.user!.schoolId;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });
    if (!school) return res.status(404).json({ error: "School not found" });

    const tokenPrice = await getTokenPrice();
    const ref =
      data.reference ||
      `TOK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await tokenWalletService.purchase(
      schoolId,
      data.tokens,
      ref,
      {
        note: `Purchase via ${data.method} — ${data.tokens} tokens @ ₦${tokenPrice}`,
        metadata: {
          method: data.method,
          unitPrice: tokenPrice,
          byUserId: req.user!.id,
        },
      },
    );
    if (result.duplicate)
      return res.status(409).json({ error: "This reference was already used" });

    // Tell the platform finance team to verify the payment.
    await notifyPlatform({
      type: "TOKEN_PURCHASE",
      title: "School token purchase — verify payment",
      message: `${school.name} bought ${data.tokens.toLocaleString()} tokens (₦${(data.tokens * tokenPrice).toLocaleString()}) via ${data.method}. Ref: ${ref}. Verify the bank transfer.`,
      schoolId,
      severity: "INFO",
      metadata: { tokens: data.tokens, reference: ref, method: data.method },
    });
    await logPlatformActivity({
      actorId: req.user!.id,
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
  }),
);
*/
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
