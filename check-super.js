const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const u = await p.platformUser.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { email: true },
  });
  console.log("SUPER_ADMIN email:", u ? u.email : "none");
  await p.$disconnect();
})();
