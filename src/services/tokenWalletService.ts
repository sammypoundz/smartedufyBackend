// Transaction-safe token wallet operations with an immutable ledger.
// Rules implemented here (Module 7):
//  1. Reserve tokens before processing an AI operation.
//  2. Charge reserved tokens after successful processing.
//  3. Release reserved tokens when processing fails.
//  4. Every mutation is written to the TokenLedger with a unique reference —
//     the DB unique constraint on (schoolId, reference) prevents duplicate
//     charges from retries or repeated requests.
import { prisma } from "../config/prisma";

export class InsufficientBalanceError extends Error {
  constructor(
    public required: number,
    public available: number,
  ) {
    super(`Insufficient token balance: need ${required}, have ${available}`);
    (this as any).status = 402;
  }
}

export const tokenWalletService = {
  /** Get (or lazily create) a school's wallet. */
  async getWallet(schoolId: string) {
    let wallet = await prisma.tokenWallet.findUnique({ where: { schoolId } });
    if (!wallet) {
      wallet = await prisma.tokenWallet.create({ data: { schoolId } });
    }
    return wallet;
  },

  async _ensureWalletTx(tx: any, schoolId: string) {
    return tx.tokenWallet.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
  },

  /** Purchase tokens (credits the wallet, records revenue). */
  async purchase(
    schoolId: string,
    tokens: number,
    reference: string,
    opts?: { note?: string; metadata?: any },
  ) {
    if (tokens <= 0) throw new Error("Token purchase must be positive");
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.upsert({
        where: { schoolId },
        create: { schoolId },
        update: {},
      });
      const existing = await tx.tokenLedger.findUnique({
        where: { schoolId_reference: { schoolId, reference } },
      });
      if (existing) return { wallet, entry: existing, duplicate: true };
      const balanceAfter = wallet.balance + tokens;
      const entry = await tx.tokenLedger.create({
        data: {
          walletId: wallet.id,
          schoolId,
          type: "PURCHASE",
          amount: tokens,
          balanceAfter,
          reference,
          description: opts?.note || `Token purchase: ${tokens} tokens`,
          metadata: opts?.metadata,
        },
      });
      const updated = await tx.tokenWallet.update({
        where: { schoolId },
        data: {
          balance: { increment: tokens },
          lifetimePurchased: { increment: tokens },
        },
      });
      return { wallet: updated, entry, duplicate: false };
    });
  },

  /** Reserve tokens for an in-flight AI operation (held, not yet consumed). */
  async reserve(schoolId: string, tokens: number, reference: string) {
    if (tokens <= 0) throw new Error("Reservation must be positive");
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.upsert({
        where: { schoolId },
        create: { schoolId },
        update: {},
      });
      if (wallet.balance < tokens) {
        throw new InsufficientBalanceError(tokens, wallet.balance);
      }
      const updated = await tx.tokenWallet.update({
        where: { schoolId },
        data: {
          balance: { decrement: tokens },
          reserved: { increment: tokens },
        },
      });
      await tx.tokenLedger.create({
        data: {
          walletId: wallet.id,
          schoolId,
          type: "RESERVE",
          amount: 0, // balance unchanged — the reservation is a hold
          balanceAfter: updated.balance,
          reference,
          description: `Reserved ${tokens} tokens for AI operation`,
        },
      });
      return updated;
    });
  },

  /** Charge reserved tokens after a successful AI operation. */
  async charge(
    schoolId: string,
    tokens: number,
    reference: string,
    metadata?: any,
  ) {
    if (tokens <= 0) throw new Error("Charge must be positive");
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.findUnique({ where: { schoolId } });
      if (!wallet) throw new Error("Wallet not found");
      // If the same reference was already charged, treat as a duplicate and no-op.
      const existing = await tx.tokenLedger.findUnique({
        where: { schoolId_reference: { schoolId, reference } },
      });
      if (existing) return { wallet, entry: existing, duplicate: true };
      const updated = await tx.tokenWallet.update({
        where: { schoolId },
        data: {
          reserved: { decrement: tokens },
          lifetimeConsumed: { increment: tokens },
        },
      });
      const entry = await tx.tokenLedger.create({
        data: {
          walletId: wallet.id,
          schoolId,
          type: "CHARGE",
          amount: -tokens,
          balanceAfter: updated.balance,
          reference,
          description: `AI operation consumed ${tokens} tokens`,
          metadata,
        },
      });
      return { wallet: updated, entry, duplicate: false };
    });
  },

  /** Release reserved tokens when processing failed. */
  async release(schoolId: string, tokens: number, reference: string) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.findUnique({ where: { schoolId } });
      if (!wallet) throw new Error("Wallet not found");
      const updated = await tx.tokenWallet.update({
        where: { schoolId },
        data: {
          reserved: { decrement: tokens },
          balance: { increment: tokens },
        },
      });
      const entry = await tx.tokenLedger.create({
        data: {
          walletId: wallet.id,
          schoolId,
          type: "RELEASE",
          amount: tokens,
          balanceAfter: updated.balance,
          reference,
          description: `Released ${tokens} reserved tokens (failed operation)`,
        },
      });
      return { wallet: updated, entry, duplicate: false };
    });
  },

  /** Administrative adjustment with a mandatory reason (audited by caller). */
  async adjust(
    schoolId: string,
    tokens: number,
    reason: string,
    reference: string,
  ) {
    if (!reason) throw new Error("Reason is required for wallet adjustments");
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.upsert({
        where: { schoolId },
        create: { schoolId },
        update: {},
      });
      const balanceAfter = wallet.balance + tokens;
      const updated = await tx.tokenWallet.update({
        where: { schoolId },
        data: { balance: { increment: tokens } },
      });
      const entry = await tx.tokenLedger.create({
        data: {
          walletId: wallet.id,
          schoolId,
          type: "ADJUSTMENT",
          amount: tokens,
          balanceAfter,
          reference,
          description: reason,
        },
      });
      return { wallet: updated, entry, duplicate: false };
    });
  },

  ledger(schoolId: string, limit = 50) {
    return prisma.tokenLedger.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};

