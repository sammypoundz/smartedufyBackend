const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.school
  .findMany({ select: { id: true, name: true } })
  .then((s) => console.log(JSON.stringify(s, null, 1)))
  .finally(() => p.$disconnect());
