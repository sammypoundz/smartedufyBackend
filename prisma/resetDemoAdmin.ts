// Reset the demo school admin password so the repro script can log in.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = "demoadmin@gmail.com";
  const newPassword = "Repro123!";
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { email }, data: { password: hashed } });
  console.log("Password reset for", email, "->", newPassword);
}

main().finally(() => prisma.$disconnect());
