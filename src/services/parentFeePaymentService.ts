// ============================================================
// Parent-facing school-fee payment orchestration (Paystack hosted
// checkout). Mirrors the token-purchase flow in biaPaymentService but
// credits the STUDENT's fee account instead of the token wallet:
//   1. startFeePayment  — validates the student belongs to the logged-in
//      parent, prices the amount SERVER-SIDE from the student's actual
//      outstanding balance, stores a PENDING BiaPaymentTransaction and
//      initializes a Paystack checkout (bank_transfer + card).
//   2. getFeePaymentStatus — school/parent-scoped status read.
//   3. fulfilFeePayment — on verified SUCCESS (poll or webhook), records a
//      FeePayment (method PAYSTACK) and recalculates the StudentFee totals.
// Fulfillment is idempotent (guarded by txn.fulfilled) and is NEVER driven
// by the browser redirect — only a Paystack server-side verification.
// ============================================================
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "../config/prisma";
import {
  initializeCheckout,
  verifyPayment,
  paystackCallbackUrl,
  paystackConfigured,
  PaystackConfigError,
  PaystackApiError,
} from "./paystackService";

export class ParentPaymentError extends Error {
  constructor(message: string, status = 400) {
    super(message);
    (this as any).status = status;
  }
}

function generateFeeReference(): string {
  return `SE-FEEPAY-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

const startSchema = z.object({
  studentId: z.string().min(1),
  // Optional partial payment. If omitted/0, the FULL outstanding balance is
  // charged — always recomputed server-side from StudentFee rows.
  amount: z.coerce.number().positive().max(10_000_000).optional(),
});

/** Student's outstanding fee balance from StudentFee rows (server-side truth). */
async function outstandingForStudent(studentId: string) {
  const rows = await prisma.studentFee.findMany({
    where: { studentId, status: { not: "PAID" } },
  });
  const total = rows.reduce((s, r) => s + (r.amountAssigned || 0), 0);
  const paid = rows.reduce((s, r) => s + (r.amountPaid || 0), 0);
  return { outstanding: Math.max(0, total - paid), rows };
}

/**
 * Verify the logged-in parent actually has this child. parentProfile may be
 * null for staff-admins paying on behalf — those skip the ownership check.
 */
async function assertParentOfStudent(
  parentId: string | null,
  studentId: string,
) {
  if (!parentId) return; // staff-initiated
  const parent = await prisma.parent.findFirst({
    where: { id: parentId, children: { some: { id: studentId } } },
    select: { id: true },
  });
  if (!parent) {
    throw new ParentPaymentError(
      "This student is not linked to your account",
      403,
    );
  }
}

export const parentFeePaymentService = {
  configured: paystackConfigured,

  /** Step 1: create a PENDING transaction and get a Paystack checkout URL. */
  startFeePayment: async (args: {
    parentId: string | null;
    parentUser: { id: string; email?: string; name?: string };
    schoolId: string;
    body: unknown;
  }) => {
    if (!paystackConfigured()) {
      throw new ParentPaymentError(
        "Online payment is not available right now — please pay at the school office.",
        503,
      );
    }
    const data = startSchema.parse(args.body);

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      include: { class: { select: { name: true } } },
    });
    if (!student || student.schoolId !== args.schoolId) {
      throw new ParentPaymentError("Student not found", 404);
    }
    await assertParentOfStudent(args.parentId, data.studentId);

    // Server-side pricing — never trust the frontend amount.
    const { outstanding } = await outstandingForStudent(data.studentId);
    const amount = data.amount
      ? Math.round(data.amount * 100) / 100
      : outstanding;
    if (amount <= 0) {
      throw new ParentPaymentError("This student has no outstanding fees 🎉");
    }
    if (data.amount && data.amount > outstanding) {
      throw new ParentPaymentError(
        `Amount exceeds the outstanding balance (₦${outstanding.toLocaleString()})`,
      );
    }

    const internalReference = generateFeeReference();
    const txn = await prisma.biaPaymentTransaction.create({
      data: {
        schoolId: args.schoolId,
        userId: args.parentUser.id,
        provider: "PAYSTACK",
        purpose: "SCHOOL_FEE_PAYMENT",
        internalReference,
        baseAmount: amount,
        feeAmount: 0,
        feeRate: 0,
        amount,
        currency: "NGN",
        tokenQuantity: 0,
        status: "PENDING",
        customerEmail: args.parentUser.email || undefined,
        customerName: args.parentUser.name || student.name,
        verificationLog: {
          studentId: data.studentId,
          studentName: student.name,
          className: student.class?.name || "",
        } as any,
      },
    });

    try {
      const session = await initializeCheckout({
        amountNaira: amount,
        customerEmail:
          args.parentUser.email || `parent+${student.id}@smartedufy.ng`,
        customerName: args.parentUser.name || student.name,
        reference: internalReference,
        callbackUrl: paystackCallbackUrl(),
        description: `School fee payment — ${student.name}${
          student.class?.name ? ` (${student.class.name})` : ""
        }`,
        metadata: {
          purpose: "SCHOOL_FEE_PAYMENT",
          studentId: data.studentId,
        },
      });
      await prisma.biaPaymentTransaction.update({
        where: { id: txn.id },
        data: {
          biaReference: session.providerReference,
          authorizationUrl: session.authorizationUrl,
        },
      });
      return {
        reference: internalReference,
        authorizationUrl: session.authorizationUrl,
        amount,
        currency: "NGN",
        student: { id: student.id, name: student.name },
      };
    } catch (e: any) {
      await prisma.biaPaymentTransaction
        .update({
          where: { id: txn.id },
          data: {
            status: "FAILED",
            verificationLog: {
              init: {
                at: new Date().toISOString(),
                ok: false,
                error: String(e?.message || e).slice(0, 500),
              },
            } as any,
          },
        })
        .catch(() => {});
      if (e instanceof PaystackConfigError || e instanceof PaystackApiError)
        throw e;
      throw new ParentPaymentError(
        "Could not start payment. Please try again.",
        502,
      );
    }
  },

  /** Status read used by the callback page to show "paid / pending". */
  getFeePaymentStatus: async (reference: string, schoolId: string) => {
    const txn = await prisma.biaPaymentTransaction.findFirst({
      where: { internalReference: reference, schoolId },
    });
    if (!txn) throw new ParentPaymentError("Payment not found", 404);
    return {
      reference: txn.internalReference,
      status: txn.status,
      fulfilled: txn.fulfilled,
      amount: txn.amount,
      currency: txn.currency,
      paidAt: txn.paidAt,
    };
  },

  /** Step 2: verify with Paystack and, on SUCCESS, record the fee payment. */
  reconcileFeePayment: async (txnId: string, trigger: string) => {
    const txn = await prisma.biaPaymentTransaction.findUnique({
      where: { id: txnId },
    });
    if (!txn || txn.purpose !== "SCHOOL_FEE_PAYMENT") return null;

    if (txn.fulfilled) {
      return {
        fulfilled: true,
        status: txn.status,
        message: "Already fulfilled",
      };
    }

    const verification = await verifyPayment(
      txn.biaReference || txn.internalReference,
    );
    await prisma.biaPaymentTransaction
      .update({
        where: { id: txn.id },
        data: {
          verificationLog: {
            ...(txn.verificationLog as any),
            [trigger]: {
              at: new Date().toISOString(),
              status: verification.status,
            },
          } as any,
        },
      })
      .catch(() => {});

    if (!verification.verified) {
      return {
        fulfilled: false,
        status: "PENDING",
        message: "Still pending at Paystack",
      };
    }

    if (verification.status === "SUCCESS") {
      const verifiedAmount = verification.amount ?? txn.amount;
      const currencyOk = verification.currency === "NGN";
      const amountOk = verifiedAmount >= txn.amount; // bank-transfer fee overage tolerated
      if (!currencyOk || !amountOk) {
        await prisma.biaPaymentTransaction.update({
          where: { id: txn.id },
          data: { status: "REVERSED" },
        });
        return {
          fulfilled: false,
          status: "REVERSED",
          message: "Payment mismatch — reconcile manually",
        };
      }

      await fulfilFeePayment(txn);
      return {
        fulfilled: true,
        status: "SUCCESS",
        message: "Fee payment recorded",
      };
    }

    await prisma.biaPaymentTransaction.update({
      where: { id: txn.id },
      data: { status: verification.status },
    });
    return {
      fulfilled: false,
      status: verification.status,
      message: verification.message,
    };
  },
};

/** Record the FeePayment + update StudentFee totals exactly once. */
async function fulfilFeePayment(txn: {
  id: string;
  schoolId: string;
  amount: number;
  internalReference: string;
}) {
  const meta = (txn as any).verificationLog || {};
  const studentId: string | undefined = meta.studentId;
  if (!studentId) {
    await prisma.biaPaymentTransaction.update({
      where: { id: txn.id },
      data: { lastFulfillError: "Missing studentId in verificationLog" },
    });
    return;
  }

  const rows = await prisma.studentFee.findMany({
    where: { studentId, status: { not: "PAID" } },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) return; // nothing outstanding — refund handled offline

  // Apply the payment across outstanding structures, oldest first.
  let remaining = txn.amount;
  for (const row of rows) {
    if (remaining <= 0) break;
    const owed = Math.max(0, row.amountAssigned - row.amountPaid);
    if (owed <= 0) continue;
    const applied = Math.min(owed, remaining);

    await prisma.feePayment.create({
      data: {
        schoolId: txn.schoolId,
        studentId,
        feeStructureId: row.feeStructureId,
        amountPaid: applied,
        paymentDate: new Date(),
        paymentMethod: "PAYSTACK",
        reference: txn.internalReference,
        breakdownItems: [
          { itemName: "Online payment", amount: applied },
        ] as any,
        status: "PAID",
      },
    });

    const newPaid = row.amountPaid + applied;
    await prisma.studentFee.update({
      where: { id: row.id },
      data: {
        amountPaid: newPaid,
        status: newPaid >= row.amountAssigned ? "PAID" : "PARTIAL",
      },
    });
    remaining -= applied;
  }

  await prisma.biaPaymentTransaction.update({
    where: { id: txn.id },
    data: {
      fulfilled: true,
      fulfilledAt: new Date(),
      status: "SUCCESS",
      paidAt: new Date(),
    },
  });
}
