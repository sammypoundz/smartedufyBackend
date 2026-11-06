// Generate the pending invoice for First Divine Newbreed (PENDING_PAYMENT sub).
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

function periodKeyFor(frequency: string, date = new Date()): string {
  const d = new Date(date);
  if (frequency === "ANNUALLY" || frequency === "ANNUAL")
    return `${d.getUTCFullYear()}-A`;
  if (frequency === "BIENNIALLY")
    return `${d.getUTCFullYear()}-${d.getUTCMonth() < 6 ? "H1" : "H2"}`;
  if (frequency === "QUARTERLY")
    return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (frequency === "TERMLY") {
    const m = d.getUTCMonth();
    const term = m >= 8 ? "T1" : m <= 2 ? "T2" : "T3";
    return `${d.getUTCFullYear()}-${term}`;
  }
  return d.toISOString().slice(0, 7);
}

async function main() {
  const schoolId = "6aeda1a0963359eecdf1247d";
  const sub = await prisma.subscription.findUnique({
    where: { schoolId },
  });
  if (!sub) throw new Error("Subscription not found");
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: sub.planId },
  });
  if (!plan) throw new Error("Plan not found");
  console.log(
    `School sub: plan=${plan.name} type=${plan.type} cycle=${sub.billingCycle} status=${sub.status} pricePerCycle=${sub.pricePerCycle}`,
  );

  const periodKey = periodKeyFor(sub.billingCycle);
  const existing = await prisma.invoice.findUnique({
    where: { schoolId_periodKey: { schoolId, periodKey } },
  });
  if (existing) {
    console.log(
      "Invoice already exists:",
      existing.invoiceNo,
      existing.status,
      existing.amount,
    );
    return;
  }

  let amount = sub.pricePerCycle ?? plan.monthlyPrice;
  let description = `${plan.name} — ${sub.billingCycle.toLowerCase()} subscription`;
  let studentSnapshot: number | null = null;
  let pricePerStudent: number | null = null;

  if (plan.type === "FIXED" && sub.pricePerCycle == null) {
    const override = await prisma.planPriceOverride.findUnique({
      where: {
        planId_billingFrequency: {
          planId: plan.id,
          billingFrequency:
            sub.billingCycle === "ANNUALLY" ? "ANNUAL" : sub.billingCycle,
        },
      },
    });
    if (override) {
      amount = override.price;
      description = `${plan.name} — ₦${override.price.toLocaleString()} ${sub.billingCycle.toLowerCase()}`;
    }
  }

  if (plan.type === "STUDENT_BASED") {
    studentSnapshot = await prisma.student.count({
      where: { schoolId, isActive: true },
    });
    pricePerStudent = sub.perStudentRateOverride ?? plan.perStudentRate ?? 0;
    amount = studentSnapshot * pricePerStudent;
    description = `${plan.name} — ${studentSnapshot} students × ₦${pricePerStudent.toLocaleString()} (${sub.billingCycle.toLowerCase()})`;
  }

  const invoiceNo = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo,
      schoolId,
      subscriptionId: sub.id,
      periodKey,
      billingModel:
        plan.type === "STUDENT_BASED"
          ? "PAY_PER_STUDENT"
          : "FIXED_SUBSCRIPTION",
      billingFrequency: sub.billingCycle,
      description,
      studentSnapshot,
      pricePerStudent,
      amount,
      dueDate,
      status: "PENDING",
      source: "MANUAL",
    },
  });

  await prisma.billingEvent
    .create({
      data: {
        schoolId,
        type: "INVOICE_GENERATED",
        eventKey: `INVOICE-${invoice.id}`,
        description: `Invoice ${invoiceNo} generated for ₦${amount.toLocaleString()}`,
        metadata: { invoiceId: invoice.id, periodKey, amount, studentSnapshot },
      },
    })
    .catch(() => undefined);

  console.log(
    "✅ Invoice created:",
    invoice.invoiceNo,
    "₦" + amount.toLocaleString(),
    `(${periodKey}, due ${dueDate.toISOString().slice(0, 10)})`,
  );
}

main().finally(() => prisma.$disconnect());
