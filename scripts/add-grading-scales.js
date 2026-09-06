/**
 * One-off seed: adds grading scales to schools.
 *  - Ensures every school has a "Default Grading" group with standard A–F grades.
 *  - Fills the (previously empty) "WEAC Standard Grade" group with WAEC grades A1–F9.
 *
 * Usage: node scripts/add-grading-scales.js   (from the backend folder)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEFAULT_GRADES = [
  { grade: "A", minScore: 80, maxScore: 100, points: 4.0 },
  { grade: "B", minScore: 70, maxScore: 79, points: 3.0 },
  { grade: "C", minScore: 60, maxScore: 69, points: 2.0 },
  { grade: "D", minScore: 50, maxScore: 59, points: 1.0 },
  { grade: "F", minScore: 0, maxScore: 49, points: 0.0 },
];

const WAEC_GRADES = [
  { grade: "A1", minScore: 75, maxScore: 100, points: 9.0 },
  { grade: "B2", minScore: 70, maxScore: 74, points: 8.0 },
  { grade: "B3", minScore: 65, maxScore: 69, points: 7.0 },
  { grade: "C4", minScore: 60, maxScore: 64, points: 6.0 },
  { grade: "C5", minScore: 55, maxScore: 59, points: 5.0 },
  { grade: "C6", minScore: 50, maxScore: 54, points: 4.0 },
  { grade: "D7", minScore: 45, maxScore: 49, points: 3.0 },
  { grade: "E8", minScore: 40, maxScore: 44, points: 2.0 },
  { grade: "F9", minScore: 0, maxScore: 39, points: 0.0 },
];

async function ensureDefaultGroup(schoolId, schoolName) {
  let group = await prisma.gradingScaleGroup.findFirst({
    where: { schoolId, isDefault: true },
  });
  if (!group) {
    group = await prisma.gradingScaleGroup.create({
      data: { schoolId, name: "Default Grading", isDefault: true },
    });
    console.log(`  created "Default Grading" group for ${schoolName}`);
  }
  const count = await prisma.gradingScale.count({
    where: { groupId: group.id },
  });
  if (count === 0) {
    await prisma.gradingScale.createMany({
      data: DEFAULT_GRADES.map((s) => ({ ...s, groupId: group.id, schoolId })),
    });
    console.log(`  added ${DEFAULT_GRADES.length} default A-F grades`);
  } else {
    console.log(`  default group already has ${count} grades, skipping`);
  }
}

async function ensureWaec() {
  const group = await prisma.gradingScaleGroup.findFirst({
    where: { name: { contains: "WEAC" } },
  });
  if (!group) {
    console.log("  no WAEC group found, skipping");
    return;
  }
  const count = await prisma.gradingScale.count({
    where: { groupId: group.id },
  });
  if (count > 0) {
    console.log(
      `  WAEC group "${group.name}" already has ${count} grades, skipping`,
    );
    return;
  }
  await prisma.gradingScale.createMany({
    data: WAEC_GRADES.map((s) => ({
      ...s,
      groupId: group.id,
      schoolId: group.schoolId,
    })),
  });
  console.log(
    `  added ${WAEC_GRADES.length} WAEC grades (A1-F9) to "${group.name}"`,
  );
}

async function main() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true },
  });
  for (const school of schools) {
    console.log(`--- ${school.name} ---`);
    await ensureDefaultGroup(school.id, school.name);
  }
  console.log("--- WAEC group ---");
  await ensureWaec();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
