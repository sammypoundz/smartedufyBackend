// Reset a school admin's password so the repro script can log in.
// Usage: npx ts-node prisma/resetAdminPassword.ts <email> <newPassword>
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "admin@school.com";
  const newPassword = process.argv[3] || "Repro123!";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // List a few admins to help find the right one.
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "PRINCIPAL"] } },
      select: { email: true, role: true, schoolId: true },
      take: 15,
    });
    console.log("User not found. Admins:", JSON.stringify(admins, null, 2));
    return;
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { email }, data: { password: hashed } });
  console.log(
    "Password reset for",
    email,
    "->",
    newPassword,
    `(school ${user.schoolId})`,
  );
}

main().finally(() => prisma.$disconnect());
