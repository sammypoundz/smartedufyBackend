const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      schoolId: true,
    },
  });
  console.log(JSON.stringify(users, null, 1));
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
