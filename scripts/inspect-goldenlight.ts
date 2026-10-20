// Inspect Goldenlight school: students missing admission numbers + ID config.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  let schools = await prisma.school.findMany({
    where: { name: { contains: "Goldenlight", mode: "insensitive" } },
  });
  if (!schools.length) {
    schools = await prisma.school.findMany({ where: { name: { contains: "Golden", mode: "insensitive" } } });
  }
  if (!schools.length) {
    const all = await prisma.school.findMany({ select: { id: true, name: true } });
    console.log('No Goldenlight match. All schools:');
    console.log(all.map((s) => `- ${s.name} (${s.id})`).join('\n'));
    return;
  }
  console.log(
    "Schools found:",
    schools.map((s) => `${s.name} (${s.id})`),
  );
  if (!schools.length) return;
  const schoolId = schools[0].id;

  const configs = await prisma.idGeneratorConfig.findMany({
    where: { schoolId },
  });
  console.log("ID configs:", JSON.stringify(configs, null, 1));

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      OR: [{ admissionNumber: null }, { admissionNumber: "" }],
    },
    select: { id: true, name: true, classId: true, armId: true },
  });
  console.log(`Students missing admission number: ${students.length}`);
  console.log(students.map((s) => s.name).join(", "));

  const total = await prisma.student.count({ where: { schoolId } });
  console.log(`Total students: ${total}`);

  // Show a sample of existing admission numbers to infer the format in use.
  const sample = await prisma.student.findMany({
    where: { schoolId, admissionNumber: { not: null } },
    select: { admissionNumber: true },
    take: 10,
  });
  console.log(
    "Sample existing admission numbers:",
    sample.map((s) => s.admissionNumber),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
