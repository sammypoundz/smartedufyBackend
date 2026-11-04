// APPLY: record Golden Light's ₦121,200 payment + set next-cycle rate to ₦500/student
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

function pad(n: number) {
  return String(n).padStart(2, "0");
}

async function main() {
  const school = await prisma.school.findFirst({
    where: {
      OR: [{ subdomain: "goldenlight" }, { name: "Golden Light School" }],
    },
  });
  if (!school) throw new Error("School not found");
  console.log("School:", school.name, school.id);

  const sub = await prisma.subscription.findUnique({
    where: { schoolId: school.id },
    include: { plan: true },
  });
  if (!sub) throw new Error("Subscription not found");
  console.log(
    `Plan: ${sub.plan.name} type=${sub.plan.type} perStudentRate=${sub.plan.perStudentRate} cycle=${sub.billingCycle} endDate=${sub.endDate.toISOString()}`,
  );

  const snapshot = await prisma.student.count({
    where: { schoolId: school.id, isActive: true },
  });
  console.log("Active students:", snapshot);

  // ---- 1. Current-cycle invoice: 404 x N300 = N121,200 ----
  const now = new Date();
  const term =
    now.getUTCMonth() >= 8 ? "T1" : now.getUTCMonth() <= 2 ? "T2" : "T3";
  const periodKey = `${now.getUTCFullYear()}-${term}`;

  let invoice = await prisma.invoice.findUnique({
    where: { schoolId_periodKey: { schoolId: school.id, periodKey } },
  });

  if (!invoice) {
    const invoiceNo = `INV-${now.getUTCFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 14);
    if (!DRY) {
      invoice = await prisma.invoice.create({
        data: {
          invoiceNo,
          schoolId: school.id,
          subscriptionId: sub.id,
          periodKey,
          billingModel: "PAY_PER_STUDENT",
          billingFrequency: sub.billingCycle,
          description: `${sub.plan.name} — ${snapshot} students × ₦300 (${sub.billingCycle.toLowerCase()})`,
          studentSnapshot: snapshot,
          pricePerStudent: 300,
          amount: snapshot * 300,
          dueDate,
          status: "PENDING",
          source: "MANUAL",
        },
      });
    }
    console.log(
      `Invoice created: ${invoiceNo} ₦${(snapshot * 300).toLocaleString()} (${periodKey})`,
    );
  } else if (invoice.status === "PENDING") {
    // Cron may have auto-created this invoice at the plan's current rate —
    // correct it to what the school actually owed/paid this cycle (₦300).
    const correctAmount = snapshot * 300;
    if (!DRY && (invoice.amount !== correctAmount || invoice.pricePerStudent !== 300)) {
      invoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          pricePerStudent: 300,
          amount: correctAmount,
          description: `${sub.plan.name} — ${snapshot} students × ₦300 (${sub.billingCycle.toLowerCase()})`,
        },
      });
      console.log(
        `Invoice corrected to ₦${correctAmount.toLocaleString()} (404 × ₦300): ${invoice.invoiceNo}`,
      );
    } else {
      console.log("Invoice already exists:", invoice.invoiceNo, invoice.status, `₦${invoice.amount.toLocaleString()}`);
    }
  } else {
    console.log("Invoice already exists:", invoice.invoiceNo, invoice.status);
  }

  // ---- 2. Record the verified payment ----
  const paymentRef = `GLS-PAY-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  if (invoice && invoice.status !== "PAID" && !DRY) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: now,
        paymentRef,
        paidAmount: invoice.amount,
      },
    });
    await prisma.subscriptionPayment.create({
      data: {
        schoolId: school.id,
        subscriptionId: sub.id,
        amount: invoice.amount,
        method: "TRANSFER",
        reference: paymentRef,
        verified: true,
        paidAt: now,
        note: `Subscription fee — ${snapshot} students × ₦300 (${sub.billingCycle.toLowerCase()} cycle)`,
      },
    });
    await prisma.billingEvent
      .create({
        data: {
          schoolId: school.id,
          type: "PAYMENT_RECORDED",
          eventKey: `PAY-${paymentRef}`,
          description: `Invoice ${invoice.invoiceNo} paid — ₦${invoice.amount.toLocaleString()} (TRANSFER)`,
          metadata: { invoiceId: invoice.id, paymentRef, method: "TRANSFER" },
        },
      })
      .catch(() => undefined);
    await prisma.billingEvent
      .create({
        data: {
          schoolId: school.id,
          type: "SUBSCRIPTION_RENEWED",
          eventKey: `RENEW-${paymentRef}`,
          description: `Subscription renewed to ${sub.endDate.toISOString().slice(0, 10)} after payment of ₦${invoice.amount.toLocaleString()}`,
          metadata: { paymentRef, endDate: sub.endDate },
        },
      })
      .catch(() => undefined);
    console.log(
      "Payment recorded:",
      paymentRef,
      "₦" + invoice.amount.toLocaleString(),
    );
  }

  // ---- 3. Per-school per-student rate override -> N500 for NEXT cycle ----
  if (!DRY) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { perStudentRateOverride: 500, studentSnapshotCount: snapshot },
    });
    console.log(
      "Subscription perStudentRateOverride set to 500 (Golden Light only)",
    );
  }

  // ---- 4. Next payment (pending invoice for the following term) ----
  const next = new Date(now);
  const nextMonthIdx =
    next.getUTCMonth() >= 8 ? 0 : next.getUTCMonth() <= 2 ? 3 : 8; // next term start month
  if (next.getUTCMonth() >= 8) next.setUTCFullYear(next.getUTCFullYear() + 1);
  next.setUTCMonth(nextMonthIdx, 1);
  const nextTerm = nextMonthIdx === 8 ? "T1" : nextMonthIdx <= 2 ? "T2" : "T3";
  const nextPeriodKey = `${next.getUTCFullYear()}-${nextTerm}`;
  const nextAmount = snapshot * 500;

  const existingNext = await prisma.invoice.findUnique({
    where: {
      schoolId_periodKey: { schoolId: school.id, periodKey: nextPeriodKey },
    },
  });
  if (!existingNext) {
    const invoiceNo = `INV-${next.getUTCFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    if (!DRY) {
      const nextInvoice = await prisma.invoice.create({
        data: {
          invoiceNo,
          schoolId: school.id,
          subscriptionId: sub.id,
          periodKey: nextPeriodKey,
          billingModel: "PAY_PER_STUDENT",
          billingFrequency: sub.billingCycle,
          description: `${sub.plan.name} — ${snapshot} students × ₦500 (${sub.billingCycle.toLowerCase()})`,
          studentSnapshot: snapshot,
          pricePerStudent: 500,
          amount: nextAmount,
          dueDate: next,
          status: "PENDING",
          source: "MANUAL",
        },
      });
      await prisma.billingEvent
        .create({
          data: {
            schoolId: school.id,
            type: "INVOICE_GENERATED",
            eventKey: `INVOICE-${nextInvoice.id}`,
            description: `Invoice ${invoiceNo} generated for ₦${nextAmount.toLocaleString()}`,
            metadata: {
              invoiceId: nextInvoice.id,
              periodKey: nextPeriodKey,
              amount: nextAmount,
              studentSnapshot: snapshot,
            },
          },
        })
        .catch(() => undefined);
    }
    console.log(
      `Next invoice: ${invoiceNo} ₦${nextAmount.toLocaleString()} (${nextPeriodKey}, due ${next.toISOString().slice(0, 10)})`,
    );
  } else {
    console.log(
      "Next invoice already exists:",
      existingNext.invoiceNo,
      existingNext.status,
    );
  }

  console.log(DRY ? "— DRY RUN, nothing written —" : "✅ Done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
