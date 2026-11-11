// Check whether First Divine Newbreed school exists and how it would filter.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const byName = await prisma.school.findMany({
    where: {
      OR: [
        { name: { contains: "divine" } },
        { name: { contains: "newbreed" } },
        { name: { contains: "new breed" } },
      ],
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });
  console.log("Matches:", JSON.stringify(byName, null, 2));

  const known = await prisma.school.findUnique({
    where: { id: "6aeda1a0963359eecdf1247d" },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });
  console.log("Known ID lookup:", JSON.stringify(known, null, 2));

  const all = await prisma.school.findMany({
    select: { id: true, name: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("All schools:", JSON.stringify(all, null, 2));
}

main().finally(() => prisma.$disconnect());
