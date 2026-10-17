/// <reference types="node" />
/**
 * Demo accountant login for Golden Light School.
 *
 * SAFETY: this script is strictly ADDITIVE.
 *  - It never deletes or modifies any existing record.
 *  - It only creates ONE new user (role ACCOUNTANT) attached to the
 *    existing "Golden Light School" (subdomain: goldenlight).
 *  - If the accountant already exists, it simply updates that demo
 *    account's password/roles so the script is safe to re-run.
 *
 * Run with:  npx ts-node prisma/createDemoAccountant.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO = {
  subdomain: "goldenlight",
  name: "Grace Obi (Demo Accountant)",
  email: "accountant@goldenlight.com",
  password: "accountant123",
};

async function main() {
  console.log("🔎 Looking for school with subdomain:", DEMO.subdomain);

  // 1. Find the school — do NOT create it, do NOT touch other schools.
  const school = await prisma.school.findUnique({
    where: { subdomain: DEMO.subdomain },
  });
  if (!school) {
    console.error(
      `❌ School with subdomain "${DEMO.subdomain}" not found. Run newSchoolSeed.ts first.`,
    );
    process.exit(1);
  }
  console.log(`✅ Found school: "${school.name}" (${school.id})`);

  // 2. Hash the demo password.
  const hashedPassword = await bcrypt.hash(DEMO.password, 10);

  // 3. Create or update ONLY this demo user.
  const user = await prisma.user.upsert({
    where: { email: DEMO.email },
    update: {
      // keep the demo account usable if re-run; nothing else is modified
      password: hashedPassword,
      isActive: true,
      schoolId: school.id,
    },
    create: {
      schoolId: school.id,
      name: DEMO.name,
      email: DEMO.email,
      password: hashedPassword,
      role: "ACCOUNTANT",
      roles: ["ACCOUNTANT"],
      isActive: true,
    },
  });

  console.log("\n🎉 Demo accountant ready!");
  console.log("📋 Login credentials:");
  console.log(`  Email:    ${DEMO.email}`);
  console.log(`  Password: ${DEMO.password}`);
  console.log(`  School:   ${school.name} (subdomain: ${school.subdomain})`);
  console.log(`  User id:  ${user.id}`);
  console.log(
    "\nDefault ACCOUNTANT privileges: fees, expenses, reports, payroll",
  );
  console.log(
    "On sign-in this user is redirected to the accountant portal (/accountant).",
  );
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
