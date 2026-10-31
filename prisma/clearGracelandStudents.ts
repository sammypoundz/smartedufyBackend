/// <reference types="node" />

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Finding Graceland Academy...");
  // Pinned to the exact school id so no other school can ever be affected.
  const GRACELAND_ID = "6ae47092c8d3f1388b6cb598";
  const school = await prisma.school.findFirst({
    where: { id: GRACELAND_ID, name: "Graceland Academy" },
  });

  if (!school) {
    console.error("❌ Graceland Academy not found.");
    return;
  }
  console.log(`🏫 School: ${school.name} (${school.id})`);

  // Only students belonging to THIS school
  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: { id: true, userId: true },
  });
  const studentIds = students.map((s) => s.id);
  const studentUserIds = students
    .map((s) => s.userId)
    .filter((id): id is string => Boolean(id));
  console.log(
    `👥 Found ${studentIds.length} students (${studentUserIds.length} linked login accounts).`,
  );

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
  await prisma.parentStudentLink.deleteMany({
    where: { schoolId: school.id },
  });
  console.log("✅ Related records deleted");

  // Delete the students themselves first (Student holds the required FK to User)
  console.log("🗑️ Deleting students...");
  await prisma.student.deleteMany({
    where: { id: { in: studentIds }, schoolId: school.id },
  });
  console.log(`✅ Deleted ${studentIds.length} students from ${school.name}.`);

  // Then delete the student login accounts (User rows tied to these students)
  console.log("🗑️ Deleting student login accounts...");
  await prisma.user.deleteMany({
    where: {
      id: { in: studentUserIds },
      schoolId: school.id, // extra guard: never touch users of other schools
      role: "STUDENT",
    },
  });
  // Also remove any orphaned STUDENT users of this school without a profile
  const withProfile = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: { userId: true },
  });
  const linked = new Set(withProfile.map((s) => s.userId));
  const orphanStudents = await prisma.user.findMany({
    where: { role: "STUDENT", schoolId: school.id },
    select: { id: true },
  });
  const orphans = orphanStudents
    .map((u) => u.id)
    .filter((id) => !linked.has(id));
  if (orphans.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: orphans }, schoolId: school.id, role: "STUDENT" },
    });
    console.log(`🧹 Deleted ${orphans.length} orphaned STUDENT user(s).`);
  }

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
