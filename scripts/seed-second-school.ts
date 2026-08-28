// Seed a second tenant to verify multi-tenancy isolation.
// Usage: npx ts-node scripts/seed-second-school.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@school.com';
  const password = 'admin123';
  const schoolName = 'Demo Second School';

  // Idempotent: reuse the school/user if it already exists
  let school = await prisma.school.findFirst({ where: { name: schoolName } });
  if (!school) {
    school = await prisma.school.create({
      data: { name: schoolName, subdomain: 'demo-second' },
    });
    console.log(`✅ Created school: ${school.name} (${school.id})`);
  } else {
    console.log(`ℹ️  School already exists: ${school.name} (${school.id})`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`ℹ️  User ${email} already exists, updating password/school...`);
    await prisma.user.update({
      where: { email },
      data: {
        password: await bcrypt.hash(password, 10),
        role: 'ADMIN',
        schoolId: school.id,
        isActive: true,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: 'Demo Admin',
        email,
        password: await bcrypt.hash(password, 10),
        role: 'ADMIN',
        isActive: true,
        schoolId: school.id,
      },
    });
    console.log(`✅ Created admin user: ${email}`);
  }

  console.log(`\nSchool ID (tenant): ${school.id}`);
  console.log(`Login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
