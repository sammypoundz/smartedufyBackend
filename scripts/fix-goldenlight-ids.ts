// ============================================================
// fix-goldenlight-ids.ts — renumber students whose admission
// numbers don't match the school's configured STUDENT format,
// then sync the ID Generator counter past the last issued ID.
//
// Usage:
//   cd backend
//   npx ts-node scripts/fix-goldenlight-ids.ts            # dry run (no writes)
//   npx ts-node scripts/fix-goldenlight-ids.ts --apply    # actually update
// ============================================================
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const SCHOOL_NAME = "Golden Light School";

function lastNumberRun(
  format: string,
): { index: number; length: number } | null {
  const m = format.match(/(\d+)(?!.*\d)/);
  if (!m || m.index === undefined) return null;
  return { index: m.index, length: m[1].length };
}

function renderWith(format: string, counter: number): string {
  // explicit {###} token
  if (/\{#+\}/.test(format)) {
    return format.replace(/\{(#+)\}/g, (_m, h: string) =>
      String(counter).padStart(h.length, "0"),
    );
  }
  const run = lastNumberRun(format);
  if (!run) throw new Error(`Format "${format}" has no counter digits`);
  const pad = Math.max(run.length, String(counter).length);
  return (
    format.slice(0, run.index) +
    String(counter).padStart(pad, "0") +
    format.slice(run.index + run.length)
  );
}

/** Extract the counter a student ID represents against the format (or null). */
function extractCounter(id: string, format: string): number | null {
  const nums = id.trim().match(/\d+/g);
  if (!nums || !nums.length) return null;
  const last = nums[nums.length - 1];
  const n = parseInt(last, 10);
  if (Number.isNaN(n) || n > 9_999_999) return null;
  return n;
}

async function main() {
  const school = await prisma.school.findFirst({
    where: { name: SCHOOL_NAME },
  });
  if (!school) throw new Error(`School "${SCHOOL_NAME}" not found`);
  console.log(
    `School: ${school.name} (${school.id})  mode=${APPLY ? "APPLY" : "DRY RUN"}`,
  );

  const config = await prisma.idGeneratorConfig.findUnique({
    where: { schoolId_role: { schoolId: school.id, role: "STUDENT" } },
  });
  const format = config?.format ?? "STU-{YEAR}-{####}";
  console.log(
    `Configured STUDENT format: ${format}  (stored counter: ${config?.counter ?? 0})`,
  );

  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: { id: true, name: true, admissionNumber: true, userId: true },
    orderBy: { name: "asc" },
  });

  // Build the set of all existing numbers so new IDs never collide.
  const used = new Set<string>();
  let maxCounter = 0;
  for (const s of students) {
    if (s.admissionNumber) {
      used.add(s.admissionNumber);
      const n = extractCounter(s.admissionNumber, format);
      if (n !== null && n > maxCounter) maxCounter = n;
    }
  }
  console.log(
    `Students: ${students.length}; highest existing counter: ${maxCounter}`,
  );

  // Students whose admission number does NOT already match the configured format.
  // The last digit run in the format is the counter — allow any number there
  // (e.g. format "GLS/STU/26/0001": literal "GLS/STU/26/" + any digits).
  const run = lastNumberRun(format);
  const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = run
    ? escaped.slice(0, run.index) +
      "\\d+" +
      escaped.slice(run.index + run.length)
    : escaped.replace(/\\\{(#+)\\\}/g, "\\d+");
  const formatRegex = new RegExp(`^${pattern}$`);
  const toFix = students.filter(
    (s) => !s.admissionNumber || !formatRegex.test(s.admissionNumber),
  );
  console.log(`Students needing renumbering into "${format}": ${toFix.length}`);
  for (const s of toFix.slice(0, 10)) {
    console.log(`  - ${s.name}: "${s.admissionNumber ?? "(none)"}"`);
  }
  if (toFix.length > 10) console.log(`  ... and ${toFix.length - 10} more`);

  if (!toFix.length) {
    console.log("Nothing to fix.");
    return;
  }

  // Assign new sequential IDs continuing past the highest used counter.
  let counter = maxCounter;
  const updates: {
    studentId: string;
    userId: string | null;
    old: string | null;
    next: string;
  }[] = [];
  for (const s of toFix) {
    let next: string;
    do {
      counter++;
      next = renderWith(format, counter);
    } while (used.has(next));
    used.add(next);
    updates.push({
      studentId: s.id,
      userId: s.userId,
      old: s.admissionNumber,
      next,
    });
  }

  console.log(`\nFirst 10 new IDs:`);
  for (const u of updates.slice(0, 10))
    console.log(`  ${u.old ?? "(none)"} -> ${u.next}`);
  console.log(`Last new ID: ${updates[updates.length - 1].next}`);
  console.log(`Final counter should be: ${counter}`);

  if (!APPLY) {
    console.log(
      "\nDRY RUN — no changes written. Re-run with --apply to commit.",
    );
    return;
  }

  for (const u of updates) {
    await prisma.student.update({
      where: { id: u.studentId },
      data: { admissionNumber: u.next },
    });
    if (u.userId) {
      await prisma.user.update({
        where: { id: u.userId },
        data: { userIdCode: u.next },
      });
    }
  }

  // Sync the stored counter so future auto IDs continue from here.
  await prisma.idGeneratorConfig.update({
    where: { schoolId_role: { schoolId: school.id, role: "STUDENT" } },
    data: { counter },
  });

  console.log(
    `\n✅ Updated ${updates.length} students. ID counter synced to ${counter}.`,
  );
  console.log(
    "⚠️  Students log in with their admission number — new IDs mean new logins.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
