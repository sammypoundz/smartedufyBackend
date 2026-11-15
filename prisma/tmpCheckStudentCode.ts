import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();
const prisma = new PrismaClient();
async function main() {
  const uri = (process.env.DATABASE_URL || "").replace(/\/\/.*@/, "//***@");
  console.log("DB:", uri);
  const nullCode = await prisma.student.count({ where: { studentCode: null } });
  const hasCode = await prisma.student.count({ where: { studentCode: { not: null } } });
  console.log("studentCode null:", nullCode, "| set:", hasCode);
}
main().finally(() => prisma.$disconnect());
