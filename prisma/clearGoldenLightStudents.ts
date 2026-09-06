/// <reference types="node" />

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Finding Golden Light School...");
  const school = await prisma.school.findFirst({
    where: {
      OR: [{ subdomain: "goldenlight" }, { name: "Golden Light School" }],
    },
  });

  if (!school) {
    console.error("❌ Golden Light School not found.");
    return;
  }
  console.log(`🏫 School: ${school.name} (${school.id})`);

  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  console.log(`👥 Found ${studentIds.length} students.`);

  if (studentIds.length === 0) {
    console.log("✅ Nothing to delete.");
    return;
  }

  // Delete student-related records first (scoped to this school's students)
  console.log("🗑️ Deleting student-related records...");
  await prisma.testAttempt.deleteMany({
    where: {
      OR: [
        { studentId: { in: studentIds } },
        { student: { schoolId: school.id } },
      ],
    },
  });
  await prisma.attendance.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.studentSubject.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.studentPromotionHistory.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.result.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.feePayment.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.studentFee.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  console.log("✅ Related records deleted");

  // Detach student references where possible, then delete students
  console.log("🗑️ Deleting students...");
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  console.log(
    `✅ Deleted ${studentIds.length} students from Golden Light School.`,
  );
  console.log(
    "🎉 Done! School, admin, teachers, classes and subjects are untouched — ready for re-upload.",
  );
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
