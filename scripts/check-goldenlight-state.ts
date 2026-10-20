// Check current ID state for Golden Light after migration attempts.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const schoolId = "6a9d3681c77740a390a47c7d";
  const format = "GLS/STU/26/0001";
  const re = /^GLS\/STU\/26\/\d{4}$/;

  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { id: true, name: true, admissionNumber: true },
  });
  const matching = students.filter(
    (s) => s.admissionNumber && re.test(s.admissionNumber),
  );
  const notMatching = students.filter(
    (s) => !s.admissionNumber || !re.test(s.admissionNumber),
  );
  console.log(
    `Total: ${students.length}, in new format: ${matching.length}, not in format: ${notMatching.length}`,
  );
  console.log("\nNot matching (first 15):");
  for (const s of notMatching.slice(0, 15)) {
    console.log(`  - ${s.name}: "${s.admissionNumber ?? "(none)"}"`);
  }

  // Duplicates check among new-format IDs
  const counts = new Map<string, number>();
  for (const s of matching)
    counts.set(s.admissionNumber!, (counts.get(s.admissionNumber!) ?? 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  console.log(`\nDuplicate new-format IDs: ${dups.length}`);
  for (const [id, n] of dups.slice(0, 10)) console.log(`  ${id} x${n}`);

  const counters = matching.map((s) =>
    parseInt(s.admissionNumber!.slice(-4), 10),
  );
  console.log(
    `\nCounter range in new format: ${Math.min(...counters)}..${Math.max(...counters)}`,
  );

  const config = await prisma.idGeneratorConfig.findUnique({
    where: { schoolId_role: { schoolId, role: "STUDENT" } },
  });
  console.log(`Stored counter: ${config?.counter}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
