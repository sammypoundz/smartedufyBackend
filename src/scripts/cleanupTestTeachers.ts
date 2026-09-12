// One-off: remove teacher test accounts created during flow debugging
import prisma from "../config/db";

const TEST_EMAILS = [
  "flowtest1@school.com",
  "flowtest2@school.com",
  "flowtest3@school.com",
];

async function main() {
  for (const email of TEST_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.teacher.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("deleted", email);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
