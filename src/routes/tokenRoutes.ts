// MODULE 7 — School-facing Edufy AI token endpoints (mounted at /api/tokens).
// Lets a school admin see their own wallet & ledger, buy tokens (a PURCHASE
// request is recorded and credited immediately for TRANSFER/USSD flows where
// the platform finance admin later confirms the bank transfer), and get
// pricing for the purchase UI.
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import {
  authMiddleware,
  roleGuard,
  type AuthRequest,
} from "../middleware/auth";
import {
  tokenWalletService,
} from "../services/tokenWalletService";
import { getTokenPrice } from "../services/platformSettingsService";
import { notifyPlatform } from "../services/platformNotificationService";
import { logPlatformActivity } from "../services/platformAuditService";

const router = Router();

const asyncRoute =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: any, res: Response) => {
    fn(req, res).catch((e: any) => {
      console.error("token route error:", e.message);
      res
        .status(e.status || 500)
        .json({ error: e.message || "Internal server error" });
    });
  };

/** Current wallet + recent ledger for the signed-in school admin. */
router.get(
  "/wallet",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL"]),
  asyncRoute(async (req: AuthRequest, res: Response) => {
    const schoolId = req.user!.schoolId;
    const [wallet, ledger, tokenPrice] = await Promise.all([
      tokenWalletService.getWallet(schoolId),
      tokenWalletService.ledger(schoolId, 30),
      getTokenPrice(),
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
  }),
);

/** Public pricing for the purchase UI (any signed-in school user). */
router.get(
  "/pricing",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    res.json({ tokenPrice: await getTokenPrice() });
  }),
);

// Token packages offered to schools (price = tokens × token price).
const PACKAGES: Record<string, number> = {
  STARTER: 50,
  STANDARD: 200,
  BULK: 1000,
};

router.get(
  "/packages",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    const price = await getTokenPrice();
    res.json(
      Object.entries(PACKAGES).map(([name, tokens]) => ({
        name,
        tokens,
        priceNgn: tokens * price,
      })),
    );
  }),
);

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

export default router;
