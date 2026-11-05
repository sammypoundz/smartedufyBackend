"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_FEE_RATE = exports.PaymentError = void 0;
exports.startTokenCheckout = startTokenCheckout;
exports.getTransactionForSchool = getTransactionForSchool;
exports.reconcileTransaction = reconcileTransaction;
exports.schoolPaymentHistory = schoolPaymentHistory;
// ============================================================
// BIA token-purchase payment orchestration.
//  - createPendingTransaction: validates the package SERVER-SIDE, prices the
//    purchase from the DB (never the frontend), stores PENDING, initialises
//    the BIA hosted checkout and stores the authorizationUrl.
//  - getTransactionForSchool: school-scoped status reads.
//  - reconcileTransaction: verifies with BIA and, when SUCCESS is confirmed
//    server-side with matching amount/currency/references, credits the school's
//    purchased-token balance via tokenWalletService.purchase (which is already
//    idempotent on the TokenLedger unique (schoolId, reference)).
// Tokens are NEVER credited because a user returned from BIA — only a verified
// SUCCESS from BIA's server triggers fulfillment.
// ============================================================
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const prisma_1 = require("../config/prisma");
const tokenWalletService_1 = require("./tokenWalletService");
const platformNotificationService_1 = require("./platformNotificationService");
const platformSettingsService_1 = require("./platformSettingsService");
const biaService_1 = require("./biaService");
const LEDGER_REF_PREFIX = "BIAPAY-";
class PaymentError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
exports.PaymentError = PaymentError;
/** Unique internal reference, e.g. SE-BIAPAY-20261104-AB12CD34. */
function generateReference() {
    return `SE-BIAPAY-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}-${(0, crypto_1.randomBytes)(5).toString("hex").toUpperCase()}`;
}
const initSchema = zod_1.z
    .object({
    // Optional AND nullable — a custom-amount purchase sends only customTokens.
    packageId: zod_1.z.string().min(1).max(100).optional().nullable(),
    // Custom purchase: school enters its own token quantity (priced at the
    // platform token price instead of a fixed package).
    customTokens: zod_1.z
        .number()
        .int("Tokens must be a whole number")
        .positive("Enter how many tokens you want")
        .max(100000, "Contact support for purchases above 100,000 tokens")
        .optional()
        .nullable(),
    customerPhone: zod_1.z.string().max(20).optional(),
})
    .refine((d) => (d.packageId && d.packageId.trim()) || (d.customTokens ?? 0) > 0, {
    message: "Choose a token package or enter a custom token amount",
    path: ["packageId"],
});
/** Processing fee charged on every token purchase payment (0.9% of base). */
exports.TOKEN_FEE_RATE = 0.009;
/** Round to 2dp (kobo) without floating-point drift. */
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
/**
 * Step 1-7 of the purchase flow: create the pending transaction, then ask BIA
 * for a hosted checkout session. The transaction is stored BEFORE calling BIA
 * so we always have a reconciliation record, even if initialization fails.
 */
async function startTokenCheckout(args) {
    const data = initSchema.parse(args.body);
    if (!(0, biaService_1.biaConfigured)()) {
        throw new PaymentError("Card/bank payment is temporarily unavailable. Please use the manual bank-transfer purchase option.", 503);
    }
    // Authoritative pricing. Either a fixed package row, or a custom token
    // quantity priced at the platform token price — BOTH resolved server-side
    // (never from frontend numbers).
    let pkg = null;
    let baseAmount;
    let tokenQuantity;
    if (data.packageId && data.packageId.trim()) {
        const row = await prisma_1.prisma.tokenPackage.findUnique({
            where: { id: data.packageId },
        });
        if (!row || !row.isActive) {
            throw new PaymentError("Selected token package is not available", 400);
        }
        pkg = { id: row.id, name: row.name, tokens: row.tokens, price: row.price };
        baseAmount = row.price;
        tokenQuantity = row.tokens;
    }
    else {
        const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
        baseAmount = round2(data.customTokens * tokenPrice);
        tokenQuantity = data.customTokens;
    }
    // 0.9% processing fee on the payment, charged on top of the base price.
    const feeAmount = round2(baseAmount * exports.TOKEN_FEE_RATE);
    const amount = round2(baseAmount + feeAmount);
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: args.schoolId },
        select: { name: true, isActive: true },
    });
    if (!school)
        throw new PaymentError("School not found", 404);
    if (!school.isActive)
        throw new PaymentError("School account is inactive", 403);
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: args.userId },
        select: { name: true, email: true, isActive: true },
    });
    if (!user || !user.isActive)
        throw new PaymentError("User not found", 404);
    if (!user.email)
        throw new PaymentError("Your account has no email for checkout", 400);
    const internalReference = generateReference();
    // 1. Store the transaction as PENDING before hitting BIA.
    const txn = await prisma_1.prisma.biaPaymentTransaction.create({
        data: {
            schoolId: args.schoolId,
            userId: args.userId,
            packageId: pkg?.id,
            internalReference,
            baseAmount,
            feeAmount,
            feeRate: exports.TOKEN_FEE_RATE,
            amount,
            currency: "NGN",
            tokenQuantity,
            isCustom: !pkg,
            status: "PENDING",
            customerEmail: user.email,
            customerName: user.name || school.name,
            customerPhone: data.customerPhone,
            verificationLog: { init: { at: new Date().toISOString() } },
        },
    });
    // 2. Initialize the BIA hosted checkout session.
    try {
        const session = await (0, biaService_1.initializeCheckout)({
            amount,
            customerEmail: user.email,
            customerName: user.name || school.name,
            customerPhone: data.customerPhone,
            reference: internalReference,
            callbackUrl: (0, biaService_1.biaCallbackUrl)(),
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
        const updated = await prisma_1.prisma.biaPaymentTransaction.update({
            where: { id: txn.id },
            data: {
                biaReference: session.biaReference,
                merchantReference: session.merchantReference,
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
    }
    catch (e) {
        // Keep the PENDING row as an audit trail; surface a safe message.
        await prisma_1.prisma.biaPaymentTransaction
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
            .catch(() => { });
        if (e instanceof biaService_1.BiaConfigError || e instanceof biaService_1.BiaApiError)
            throw e;
        throw new PaymentError("Could not start payment. Please try again.", 502);
    }
}
/** Fetch a transaction enforcing school ownership (admin can see all). */
async function getTransactionForSchool(reference, schoolId) {
    const txn = await prisma_1.prisma.biaPaymentTransaction.findFirst({
        where: {
            OR: [{ internalReference: reference }, { biaReference: reference }],
            schoolId, // tenant isolation — a school can only see its own payments
        },
    });
    if (!txn)
        throw new PaymentError("Transaction not found", 404);
    return txn;
}
function logEvent(existing, event, detail) {
    const log = typeof existing === "object" && existing !== null ? { ...existing } : {};
    log[event] = {
        ...log[event],
        ...detail,
        at: new Date().toISOString(),
    };
    // keep the log bounded
    const keys = Object.keys(log);
    if (keys.length > 20)
        delete log[keys[0]];
    return log;
}
/**
 * Verify a transaction with BIA and fulfil it if BIA's servers say SUCCESS.
 * Safe to call from the webhook, the status endpoint, and a manual retry —
 * every path funnels through the same idempotent fulfillment.
 */
async function reconcileTransaction(txnId, trigger) {
    const txn = await prisma_1.prisma.biaPaymentTransaction.findUnique({
        where: { id: txnId },
    });
    if (!txn)
        throw new PaymentError("Transaction not found", 404);
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
    const verification = await (0, biaService_1.verifyPayment)(txn.biaReference);
    // Log the attempt (bounded, no secrets).
    await prisma_1.prisma.biaPaymentTransaction
        .update({
        where: { id: txn.id },
        data: {
            verificationLog: logEvent(txn.verificationLog, `verify-${trigger}`, {
                biaStatus: verification.status,
                amount: verification.amount,
            }),
        },
    })
        .catch(() => { });
    if (!verification.verified) {
        // Temporary BIA failure → stay PENDING and reconcile later.
        return {
            reference: txn.internalReference,
            status: txn.status,
            fulfilled: false,
            message: verification.message ||
                "Payment verification unavailable — still pending",
        };
    }
    if (verification.status === "PENDING") {
        return {
            reference: txn.internalReference,
            status: "PENDING",
            fulfilled: false,
            message: "Payment is still pending at BIA",
        };
    }
    if (verification.status !== "SUCCESS") {
        // Definitive non-success from BIA (FAILED / EXPIRED / REVERSED).
        await prisma_1.prisma.biaPaymentTransaction.update({
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
    const amountOk = typeof verification.amount === "number" &&
        Math.abs(verification.amount - txn.amount) < 0.01;
    const currencyOk = !verification.currency || verification.currency === txn.currency;
    const refOk = !verification.biaReference ||
        verification.biaReference === txn.biaReference;
    const merchantOk = !verification.merchantReference ||
        verification.merchantReference === txn.internalReference;
    if (!amountOk || !currencyOk || !refOk || !merchantOk) {
        await prisma_1.prisma.biaPaymentTransaction
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
            .catch(() => { });
        await (0, platformNotificationService_1.notifyPlatform)({
            type: "PAYMENT",
            title: "BIA payment mismatch — tokens NOT credited",
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
    const fresh = await prisma_1.prisma.biaPaymentTransaction.findUnique({
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
        const result = await tokenWalletService_1.tokenWalletService.purchase(txn.schoolId, txn.tokenQuantity, ledgerRef, {
            note: `Purchased ${txn.tokenQuantity} Edufy AI tokens through BIA CONNECT`,
            metadata: {
                provider: "BIA",
                transactionId: txn.id,
                biaReference: txn.biaReference,
                amountNgn: txn.amount,
                purpose: "EDUFY_AI_TOKEN_PURCHASE",
            },
        });
        if (result.duplicate) {
            // Ledger entry already exists → fulfilment happened in a race; just mark done.
            await prisma_1.prisma.biaPaymentTransaction.update({
                where: { id: txn.id },
                data: {
                    status: "SUCCESS",
                    fulfilled: true,
                    fulfilledAt: txn.fulfilledAt || new Date(),
                    paidAt: txn.paidAt ||
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
        const updated = await prisma_1.prisma.biaPaymentTransaction.update({
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
        await (0, platformNotificationService_1.notifyPlatform)({
            type: "TOKEN_PURCHASE",
            title: "BIA token purchase credited",
            message: `₦${txn.amount.toLocaleString()} verified via BIA — ${txn.tokenQuantity.toLocaleString()} tokens credited (ref ${txn.internalReference}).`,
            schoolId: txn.schoolId,
            severity: "INFO",
            metadata: { reference: txn.internalReference, tokens: txn.tokenQuantity },
        }).catch(() => { });
        return {
            reference: updated.internalReference,
            status: "SUCCESS",
            fulfilled: true,
            tokensCredited: updated.tokenQuantity,
        };
    }
    catch (e) {
        // DB hiccup during fulfillment: leave PENDING+SUCCESS-unknown so a later
        // verification/webhook/poll retries. Record the attempt for forensics.
        await prisma_1.prisma.biaPaymentTransaction
            .update({
            where: { id: txn.id },
            data: {
                fulfillAttempts: { increment: 1 },
                lastFulfillError: String(e?.message || e).slice(0, 500),
            },
        })
            .catch(() => { });
        return {
            reference: txn.internalReference,
            status: "PENDING",
            fulfilled: false,
            message: "Payment verified but crediting is still in progress — try again shortly",
        };
    }
}
/** Token purchase history for one school (already tenant-scoped). */
async function schoolPaymentHistory(schoolId, limit = 50) {
    return prisma_1.prisma.biaPaymentTransaction.findMany({
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
        },
    });
}
