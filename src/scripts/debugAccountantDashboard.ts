// Debug: inspect fees/payments/expense data behind the accountant dashboard.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const schoolId = process.argv[2] || "6a9d3681c77740a390a47c7d";

  const feeStructures = await prisma.feeStructure.findMany({
    where: { schoolId },
  });
  console.log(
    "FEE STRUCTURES:",
    JSON.stringify(feeStructures, null, 1).slice(0, 3000),
  );

  const payments = await prisma.feePayment.findMany({
    where: { schoolId },
    select: { amountPaid: true, paymentDate: true, studentId: true },
    take: 10,
    orderBy: { paymentDate: "desc" },
  });
  console.log("\nRECENT PAYMENTS:", JSON.stringify(payments, null, 1));
  const allPayments = await prisma.feePayment.findMany({
    where: { schoolId },
    select: { amountPaid: true },
  });
  console.log("Payment count:", allPayments.length);
  console.log(
    "Sum amountPaid:",
    allPayments.reduce((s, p) => s + (p.amountPaid || 0), 0),
  );

  const expenses = await prisma.expense.findMany({
    where: { schoolId },
    select: { amount: true, date: true },
  });
  console.log(
    "\nExpenses:",
    expenses.length,
    "Sum:",
    expenses.reduce((s, e) => s + (e.amount || 0), 0),
  );

  const payroll = await prisma.payroll.findMany({
    where: { schoolId },
    select: { amount: true, month: true, status: true },
  });
  console.log(
    "\nPayroll entries:",
    JSON.stringify(payroll.slice(0, 10), null, 1),
  );

  const studentFees = await prisma.studentFee.findMany({
    where: { schoolId },
    select: { amountAssigned: true, amountPaid: true, status: true },
    take: 10,
  });
  console.log("\nStudentFee sample:", JSON.stringify(studentFees, null, 1));
  const sfAll = await prisma.studentFee.findMany({
    where: { schoolId },
    select: { amountAssigned: true, amountPaid: true },
  });
  console.log(
    "StudentFee count:",
    sfAll.length,
    "assigned sum:",
    sfAll.reduce((s, f) => s + (f.amountAssigned || 0), 0),
    "paid sum:",
    sfAll.reduce((s, f) => s + (f.amountPaid || 0), 0),
  );

  const students = await prisma.student.findMany({
    where: { schoolId },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true } },
      arm: { select: { class: { select: { name: true } } } },
    },
    take: 5,
  });
  console.log(
    "\nStudent class shape sample:",
    JSON.stringify(students, null, 1),
  );
}

main().finally(() => prisma.$disconnect());
