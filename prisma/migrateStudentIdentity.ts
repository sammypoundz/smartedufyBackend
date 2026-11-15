// ============================================================
// One-off migration: student identity hardening — DATA-PRESERVING.
//
//   npx.cmd ts-node prisma/migrateStudentIdentity.ts            # dry-run report
//   npx.cmd ts-node prisma/migrateStudentIdentity.ts --apply    # additive writes only
//   npx.cmd ts-node prisma/migrateStudentIdentity.ts --apply-codes
//                                                             # also backfill studentCode
//
// IMPORTANT: this script NEVER renames, clears or alters any existing school
// data (no admission-number rewrites, no deletes). It is strictly:
//
//   1. REPORT duplicate admission numbers within a school (read-only).
//      Duplicates are printed for an admin to correct manually in the UI —
//      nothing is renamed or overwritten. (Before the new compound unique
//      index {schoolId, admissionNumber} can be created on Mongo, any real
//      duplicates must be resolved by the school; the report identifies them.)
//   2. OPTIONAL backfill of `studentCode` (STD-000001…) for students that
//      lack one — additive only, gated behind --apply-codes.
// ============================================================
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: require("path").join(__dirname, "..", ".env") });

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const APPLY_CODES = process.argv.includes("--apply-codes");

async function main() {
  console.log(
    `\n=== Student identity migration (${APPLY_CODES ? "BACKFILL CODES" : APPLY ? "APPLY" : "DRY RUN — read-only"}) ===\n`,
  );

  // ---- 1. Duplicate admission numbers within one school: REPORT ONLY ----
  const groups = await prisma.student.groupBy({
    by: ["schoolId", "admissionNumber"],
    where: { admissionNumber: { not: null } },
    _count: { _all: true },
    having: { admissionNumber: { _count: { gte: 2 } } },
  });
  console.log(
    `Duplicate (schoolId, admissionNumber) groups: ${groups.length}` +
      (groups.length
        ? "  ← resolve these manually BEFORE creating the unique index"
        : "  ✔ none, index can be created safely"),
  );
  for (const g of groups) {
    const rows = await prisma.student.findMany({
      where: { schoolId: g.schoolId, admissionNumber: g.admissionNumber },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, createdAt: true },
    });
    console.log(
      `  school=${g.schoolId} adm=${g.admissionNumber} x${rows.length}` +
        rows.map((r) => `\n    - ${r.id}  ${r.name}  (created ${r.createdAt?.toISOString?.() ?? r.createdAt})`).join(""),
    );
  }

  // ---- 2. studentsCode coverage report (+ optional additive backfill) ----
  const missingCount = await prisma.student.count({ where: { studentCode: null } });
  const totalCount = await prisma.student.count();
  console.log(`\nStudents missing studentCode: ${missingCount} of ${totalCount}`);

  if ((APPLY || APPLY_CODES) && missingCount > 0) {
    const missing = await prisma.student.findMany({
      where: { studentCode: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const used = new Set<string>(
      (
        await prisma.student.findMany({
          where: { studentCode: { not: null } },
          select: { studentCode: true },
        })
      ).map((s) => s.studentCode as string),
    );
    // Continue past the highest existing STD number; only NEW codes are set.
    let next = 0;
    for (const c of used) {
      const m = c?.match(/^STD-(\d+)$/);
      if (m) next = Math.max(next, parseInt(m[1], 10));
    }
    for (const s of missing) {
      next += 1;
      const code = `STD-${String(next).padStart(6, "0")}`;
      used.add(code);
      await prisma.student.update({ where: { id: s.id }, data: { studentCode: code } });
    }
    console.log(
      `✔ Backfilled studentCode on ${missing.length} students (up to STD-${String(next).padStart(6, "0")}). No other fields touched.`,
    );
  }

  console.log(
    `\n=== ${missingCount > 0 && !(APPLY || APPLY_CODES) ? "Dry run complete — rerun with --apply-codes to backfill codes" : "Done"} ===\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
