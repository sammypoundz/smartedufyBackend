const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const prisma = new PrismaClient();

async function main() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true, subdomain: true, isActive: true },
  });
  console.log("--- all schools ---");
  console.log(JSON.stringify(schools, null, 2));
  const graceland = schools.filter(
    (s) =>
      (s.name || "").toLowerCase().includes("graceland") ||
      (s.subdomain || "").toLowerCase().includes("graceland"),
  );
  for (const s of graceland) {
    const students = await prisma.student.count({ where: { schoolId: s.id } });
    const studentUsers = await prisma.user.count({
      where: { schoolId: s.id, role: "STUDENT" },
    });
    console.log(
      `>> ${s.name} (${s.id}, subdomain=${s.subdomain}): ${students} students, ${studentUsers} STUDENT users`,
    );
  }
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
