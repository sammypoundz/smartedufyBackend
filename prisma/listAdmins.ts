// List admin users so we can find valid login credentials for the repro.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "PRINCIPAL"] } },
    select: { email: true, name: true, role: true, schoolId: true },
    take: 20,
  });
  console.log(JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());
