// ============================================================
// Paystack token-purchase payment orchestration (bank transfer).
//  - createPendingTransaction: validates the package SERVER-SIDE, prices the
//    purchase from the DB (never the frontend), stores PENDING, initialises
//    the Paystack hosted checkout (bank_transfer channel) and stores the
//    authorizationUrl.
//  - getTransactionForSchool: school-scoped status reads.
//  - reconcileTransaction: verifies with Paystack and, when SUCCESS is
//    confirmed server-side with matching amount/currency/references, credits
//    the school's purchased-token balance via tokenWalletService.purchase
//    (which is already idempotent on the TokenLedger unique (schoolId, ref)).
// Tokens are NEVER credited because a user returned from Paystack — only a
// verified SUCCESS from Paystack's server triggers fulfillment.
// ============================================================
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "../config/prisma";
import { tokenWalletService } from "./tokenWalletService";
import { notifyPlatform } from "./platformNotificationService";
import { getTokenPrice } from "./platformSettingsService";
import {
  initializeCheckout,
  verifyPayment,
  paystackCallbackUrl,
  paystackConfigured,
  PaystackConfigError,
  PaystackApiError,
} from "./paystackService";

const LEDGER_REF_PREFIX = "BIAPAY-";
// NOTE: the DB model is still named BiaPaymentTransaction (a legacy name kept
// to avoid a destructive rename of existing MongoDB collections/fields), but
// the actual payment gateway is now Paystack. `provider` records this.

export class PaymentError extends Error {
  constructor(message: string, status = 400) {
    super(message);
    (this as any).status = status;
  }
}

/** Unique internal reference, e.g. SE-PAYSTACK-20261105-AB12CD34. */
function generateReference(): string {
  return `SE-PAYSTACK-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

const initSchema = z
  .object({
    // Optional AND nullable — a custom-amount purchase sends only customTokens.
    packageId: z.string().min(1).max(100).optional().nullable(),
    // Custom purchase: school enters its own token quantity (priced at the
    // platform token price instead of a fixed package).
    customTokens: z
      .number()
      .int("Tokens must be a whole number")
      .positive("Enter how many tokens you want")
      .max(100000, "Contact support for purchases above 100,000 tokens")
      .optional()
      .nullable(),
    customerPhone: z.string().max(20).optional(),
  })
  .refine((d) => (d.packageId && d.packageId.trim()) || (d.customTokens ?? 0) > 0, {
    message: "Choose a token package or enter a custom token amount",
    path: ["packageId"],
  });

/** Processing fee charged on token purchase payments — REMOVED (no extra fee). */
export const TOKEN_FEE_RATE = 0;

/** Round to 2dp (kobo) without floating-point drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Step 1-7 of the purchase flow: create the pending transaction, then ask
 * Paystack for a hosted checkout session. The transaction is stored BEFORE
 * calling Paystack so we always have a reconciliation record, even if
 * initialization fails.
 */
export async function startTokenCheckout(args: {
  schoolId: string;
  userId: string;
  body: unknown;
  ip?: string;
}) {
  const data = initSchema.parse(args.body);
  if (!paystackConfigured()) {
    throw new PaymentError(
      "Bank payment is temporarily unavailable. Please try again shortly or contact support to top up your tokens.",
      503,
    );
  }

  // Authoritative pricing. Either a fixed package row, or a custom token
  // quantity priced at the platform token price — BOTH resolved server-side
  // (never from frontend numbers).
  let pkg: { id: string; name: string; tokens: number; price: number } | null =
    null;
  let baseAmount: number;
  let tokenQuantity: number;
  if (data.packageId && data.packageId.trim()) {
    const row = await prisma.tokenPackage.findUnique({
      where: { id: data.packageId },
    });
    if (!row || !row.isActive) {
      throw new PaymentError("Selected token package is not available", 400);
    }
    pkg = { id: row.id, name: row.name, tokens: row.tokens, price: row.price };
    baseAmount = row.price;
    tokenQuantity = row.tokens;
  } else {
    const tokenPrice = await getTokenPrice();
    baseAmount = round2(data.customTokens! * tokenPrice);
    tokenQuantity = data.customTokens!;
  }

  // No processing fee is charged — the school pays exactly the base price.
  const feeAmount = 0;
  const amount = round2(baseAmount);

  const school = await prisma.school.findUnique({
    where: { id: args.schoolId },
    select: { name: true, isActive: true },
  });
  if (!school) throw new PaymentError("School not found", 404);
  if (!school.isActive)
    throw new PaymentError("School account is inactive", 403);

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) throw new PaymentError("User not found", 404);
  if (!user.email)
    throw new PaymentError("Your account has no email for checkout", 400);

  const internalReference = generateReference();

  // 1. Store the transaction as PENDING before hitting Paystack.
  const txn = await prisma.biaPaymentTransaction.create({
    data: {
      schoolId: args.schoolId,
      userId: args.userId,
      packageId: pkg?.id,
      internalReference,
      baseAmount,
      feeAmount,
      feeRate: TOKEN_FEE_RATE,
      amount,
      currency: "NGN",
      tokenQuantity,
      isCustom: !pkg,
      status: "PENDING",
      provider: "PAYSTACK",
      customerEmail: user.email,
      customerName: user.name || school.name,
      customerPhone: data.customerPhone,
      verificationLog: { init: { at: new Date().toISOString() } },
    },
  });

  // 2. Initialize the Paystack hosted checkout session (bank transfer).
  try {
    const session = await initializeCheckout({
      amountNaira: amount,
      customerEmail: user.email,
      customerName: user.name || school.name,
      customerPhone: data.customerPhone,
      reference: internalReference,
      callbackUrl: paystackCallbackUrl(),
      description: `SmartEdufy Edufy AI Token Purchase — ${pkg ? pkg.name : "Custom"} (${tokenQuantity} tokens)`,
      metadata: {
        purpose: "EDUFY_AI_TOKEN_PURCHASE",
        schoolId: args.schoolId,
        tokenQuantity,
        packageId: pkg?.id,
        isCustom: !pkg,
      },
      expiresInMinutes: 60,
    });

    const updated = await prisma.biaPaymentTransaction.update({
      where: { id: txn.id },
      data: {
        biaReference: session.providerReference,
        merchantReference: session.reference || session.providerReference,
        authorizationUrl: session.authorizationUrl,
        checkoutExpiresAt: session.expiresAt
          ? new Date(session.expiresAt)
          : null,
        verificationLog: {
          init: { at: new Date().toISOString(), ok: true },
        },
      },
    });

    return {
      transaction: updated,
      checkout: {
        reference: updated.internalReference,
        authorizationUrl: session.authorizationUrl,
        amount: updated.amount,
        currency: updated.currency,
        tokenQuantity: updated.tokenQuantity,
        expiresAt: session.expiresAt || null,
      },
    };
  } catch (e: any) {
    // Keep the PENDING row as an audit trail; surface a safe message.
    await prisma.biaPaymentTransaction
      .update({
        where: { id: txn.id },
        data: {
          verificationLog: {
            init: {
              at: new Date().toISOString(),
              ok: false,
              error: String(e?.message || e).slice(0, 500),
            },
          },
        },
      })
      .catch(() => {});
    if (e instanceof PaystackConfigError || e instanceof PaystackApiError) throw e;
    throw new PaymentError("Could not start payment. Please try again.", 502);
  }
}

/** Fetch a transaction enforcing school ownership (admin can see all). */
export async function getTransactionForSchool(
  reference: string,
  schoolId: string,
) {
  const txn = await prisma.biaPaymentTransaction.findFirst({
    where: {
      OR: [{ internalReference: reference }, { biaReference: reference }],
      schoolId, // tenant isolation — a school can only see its own payments
    },
  });
  if (!txn) throw new PaymentError("Transaction not found", 404);
  return txn;
}

function logEvent(
  existing: any,
  event: string,
  detail: Record<string, unknown>,
) {
  const log =
    typeof existing === "object" && existing !== null ? { ...existing } : {};
  log[event] = {
    ...(log[event] as any),
    ...detail,
    at: new Date().toISOString(),
  };
  // keep the log bounded
  const keys = Object.keys(log);
  if (keys.length > 20) delete log[keys[0]];
  return log;
}

export interface ReconcileResult {
  reference: string;
  status: string;
  fulfilled: boolean;
  tokensCredited?: number;
  message?: string;
}

/**
 * Verify a transaction with Paystack and fulfil it if Paystack's servers say
 * SUCCESS.
 * Safe to call from the webhook, the status endpoint, and a manual retry —
 * every path funnels through the same idempotent fulfillment.
 */
export async function reconcileTransaction(
  txnId: string,
  trigger: "WEBHOOK" | "STATUS_POLL" | "MANUAL",
): Promise<ReconcileResult> {
  const txn = await prisma.biaPaymentTransaction.findUnique({
    where: { id: txnId },
  });
  if (!txn) throw new PaymentError("Transaction not found", 404);
  if (txn.fulfilled) {
    return {
      reference: txn.internalReference,
      status: txn.status,
      fulfilled: true,
      tokensCredited: txn.tokenQuantity,
      message: "Already fulfilled",
    };
  }
  if (!txn.biaReference) {
    return {
      reference: txn.internalReference,
      status: txn.status,
      fulfilled: false,
      message: "Checkout was never initialised",
    };
  }

  const verification = await verifyPayment(txn.biaReference!);

  // Log the attempt (bounded, no secrets).
  await prisma.biaPaymentTransaction
    .update({
      where: { id: txn.id },
      data: {
        verificationLog: logEvent(txn.verificationLog, `verify-${trigger}`, {
          biaStatus: verification.status,
          amount: verification.amount,
        }),
      },
    })
    .catch(() => {});

  if (!verification.verified) {
    // Temporary Paystack failure → stay PENDING and reconcile later.
    return {
      reference: txn.internalReference,
      status: txn.status,
      fulfilled: false,
      message:
        verification.message ||
        "Payment verification unavailable — still pending",
    };
  }

  if (verification.status === "PENDING") {
    return {
      reference: txn.internalReference,
      status: "PENDING",
      fulfilled: false,
      message: "Payment is still pending at Paystack",
    };
  }

  if (verification.status !== "SUCCESS") {
    // Definitive non-success from Paystack (FAILED / EXPIRED / REVERSED).
    await prisma.biaPaymentTransaction.update({
      where: { id: txn.id },
      data: { status: verification.status },
    });
    return {
      reference: txn.internalReference,
      status: verification.status,
      fulfilled: false,
      message: `Payment ${verification.status.toLowerCase()}`,
    };
  }

  // SUCCESS — validate amount, currency and references BEFORE crediting.
  const amountOk =
    typeof verification.amount === "number" &&
    Math.abs(verification.amount - txn.amount) < 0.01;
  const currencyOk =
    !verification.currency || verification.currency === txn.currency;
  const refOk =
    !verification.providerReference ||
    verification.providerReference === txn.biaReference;
  const merchantOk = !verification.providerReference || verification.providerReference === txn.internalReference;

  if (!amountOk || !currencyOk || !refOk || !merchantOk) {
    await prisma.biaPaymentTransaction
      .update({
        where: { id: txn.id },
        data: {
          status: "REVERSED",
          verificationLog: logEvent(txn.verificationLog, "mismatch", {
            amountOk,
            currencyOk,
            refOk,
            merchantOk,
            biaAmount: verification.amount,
            biaCurrency: verification.currency,
          }),
        },
      })
      .catch(() => {});
    await notifyPlatform({
      type: "PAYMENT",
      title: "Paystack payment mismatch — tokens NOT credited",
      message: `Transaction ${txn.internalReference} (${txn.schoolId}) reported SUCCESS but failed validation (amountOk=${amountOk}, currencyOk=${currencyOk}, refOk=${refOk}, merchantOk=${merchantOk}). Reconcile manually before crediting.`,
      schoolId: txn.schoolId,
      severity: "CRITICAL",
      metadata: { reference: txn.internalReference },
    });
    return {
      reference: txn.internalReference,
      status: "REVERSED",
      fulfilled: false,
      message: "Payment details did not match — platform finance team notified",
    };
  }

  // ---- Idempotent fulfillment -------------------------------------------
  // The TokenLedger unique (schoolId, reference) is the single source of
  // truth: BIAPAY-<internalReference> can only ever be written once, so
  // duplicate webhooks / concurrent verifications / server restarts can
  // never credit the wallet twice. tokenWalletService.purchase runs the
  // ledger check + balance increment inside one Prisma interactive
  // transaction (atomic on MongoDB).
  const ledgerRef = `${LEDGER_REF_PREFIX}${txn.internalReference}`;

  // Fast-path: another caller already fulfilled this transaction.
  const fresh = await prisma.biaPaymentTransaction.findUnique({
    where: { id: txn.id },
  });
  if (fresh?.fulfilled) {
    return {
      reference: fresh.internalReference,
      status: fresh.status,
      fulfilled: true,
      tokensCredited: fresh.tokenQuantity,
    };
  }

  try {
    const result = await tokenWalletService.purchase(
      txn.schoolId,
      txn.tokenQuantity,
      ledgerRef,
      {
        note: `Purchased ${txn.tokenQuantity} Edufy AI tokens through Paystack bank transfer`,
        metadata: {
          provider: "PAYSTACK",
          transactionId: txn.id,
          paystackReference: txn.biaReference,
          amountNgn: txn.amount,
          purpose: "EDUFY_AI_TOKEN_PURCHASE",
        },
      },
    );

    if (result.duplicate) {
      // Ledger entry already exists → fulfilment happened in a race; just mark done.
      await prisma.biaPaymentTransaction.update({
        where: { id: txn.id },
        data: {
          status: "SUCCESS",
          fulfilled: true,
          fulfilledAt: txn.fulfilledAt || new Date(),
          paidAt:
            txn.paidAt ||
            (verification.paidAt ? new Date(verification.paidAt) : new Date()),
        },
      });
      return {
        reference: txn.internalReference,
        status: "SUCCESS",
        fulfilled: true,
        tokensCredited: txn.tokenQuantity,
        message: "Already credited (idempotent)",
      };
    }

    // Ledger written and wallet incremented atomically → finalise the txn.
    const updated = await prisma.biaPaymentTransaction.update({
      where: { id: txn.id },
      data: {
        status: "SUCCESS",
        fulfilled: true,
        fulfilledAt: new Date(),
        paidAt: verification.paidAt
          ? new Date(verification.paidAt)
          : new Date(),
      },
    });

    await notifyPlatform({
      type: "TOKEN_PURCHASE",
      title: "Paystack token purchase credited",
      message: `₦${txn.amount.toLocaleString()} verified via Paystack — ${txn.tokenQuantity.toLocaleString()} tokens credited (ref ${txn.internalReference}).`,
      schoolId: txn.schoolId,
      severity: "INFO",
      metadata: { reference: txn.internalReference, tokens: txn.tokenQuantity },
    }).catch(() => {});

    return {
      reference: updated.internalReference,
      status: "SUCCESS",
      fulfilled: true,
      tokensCredited: updated.tokenQuantity,
    };
  } catch (e: any) {
    // DB hiccup during fulfillment: leave PENDING+SUCCESS-unknown so a later
    // verification/webhook/poll retries. Record the attempt for forensics.
    await prisma.biaPaymentTransaction
      .update({
        where: { id: txn.id },
        data: {
          fulfillAttempts: { increment: 1 },
          lastFulfillError: String(e?.message || e).slice(0, 500),
        },
      })
      .catch(() => {});
    return {
      reference: txn.internalReference,
      status: "PENDING",
      fulfilled: false,
      message:
        "Payment verified but crediting is still in progress — try again shortly",
    };
  }
}

/** Token purchase history for one school (already tenant-scoped). */
export async function schoolPaymentHistory(schoolId: string, limit = 50) {
  return prisma.biaPaymentTransaction.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      internalReference: true,
      biaReference: true,
      amount: true,
      currency: true,
      tokenQuantity: true,
      status: true,
      provider: true,
      purpose: true,
      createdAt: true,
      paidAt: true,
      fulfilled: true,
      fulfilledAt: true,
    } as any,
  });
}
