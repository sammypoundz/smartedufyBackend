// Seeds the initial SUPER_ADMIN for the platform console (/api/platform/auth/login).
// Usage: node scripts/seed-platform-admin.js [email] [password]
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || "superadmin@smartedufy.com").toLowerCase();
  const password = process.argv[3] || "SuperAdmin@2026";
  const hash = await bcrypt.hash(password, 10);

  const existing = await prisma.platformUser.findUnique({ where: { email } });
  if (existing) {
    await prisma.platformUser.update({
      where: { email },
      data: { password: hash, role: "SUPER_ADMIN", isActive: true },
    });
    console.log(`Updated existing SUPER_ADMIN: ${email}`);
  } else {
    await prisma.platformUser.create({
      data: {
        name: "Super Admin",
        email,
        password: hash,
        role: "SUPER_ADMIN",
        isActive: true,
      },
    });
    console.log(`Created SUPER_ADMIN: ${email}`);
  }
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
