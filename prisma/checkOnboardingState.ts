// Check what actually persisted for the Newbreed school's onboarding.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();
const schoolId = "6aeda1a0963359eecdf1247d";

async function main() {
  const progress = await prisma.schoolOnboardingProgress.findUnique({
    where: { schoolId },
  });
  console.log("--- PROGRESS ROW ---");
  console.log(JSON.stringify(progress, null, 2));

  const [classes, subjects, years, terms] = await Promise.all([
    prisma.class.findMany({ where: { schoolId } }),
    prisma.subject.findMany({ where: { schoolId } }),
    prisma.academicYear.findMany({ where: { schoolId }, include: { terms: true } }),
    prisma.term.findMany({ where: { schoolId } }),
  ]);
  console.log("\n--- CLASSES ---", classes.map((c) => c.name));
  console.log("--- SUBJECTS ---", subjects.map((s) => s.name));
  console.log("--- YEARS ---", JSON.stringify(years.map((y) => ({ name: y.name, active: y.isActive, terms: y.terms.map((t) => t.name) }))));
  console.log("--- TERMS ---", terms.map((t) => t.name));

  const admins = await prisma.user.findMany({
    where: { schoolId, role: { in: ["ADMIN", "PRINCIPAL"] } },
    select: { email: true, name: true, role: true },
  });
  console.log("\n--- ADMINS ---", admins);
}

main().finally(() => prisma.$disconnect());
