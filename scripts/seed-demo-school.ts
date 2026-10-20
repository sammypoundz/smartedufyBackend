// ============================================================
// seed-demo-school.ts — create (or reset) a fully-populated DEMO
// school so changes can be tested without touching live schools.
//
// Idempotent: running it again reuses the existing demo school and
// only adds what's missing. Class/Arm/Subject have no unique
// constraints in the schema, so we look up first, then create.
//
// Usage:
//   cd backend
//   npx ts-node scripts/seed-demo-school.ts            # create/extend
//   npx ts-node scripts/seed-demo-school.ts --reset    # wipe demo school data first
// ============================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const SCHOOL_NAME = 'Demo Test School';
const SUBDOMAIN = 'demo-test';
const ADMIN_EMAIL = 'admin@demo.school';
const ADMIN_PASSWORD = 'demo1234';
const STUDENT_PASSWORD = 'demo1234';

const CLASSES = [
  { name: 'JSS 1', arms: ['A', 'B'] },
  { name: 'JSS 2', arms: ['A'] },
  { name: 'SS 1', arms: ['A', 'B'] },
];

const SUBJECT_NAMES = ['Mathematics', 'English Language', 'Basic Science', 'Social Studies'];

// Deterministic demo names — stable across re-runs.
const FIRST_NAMES = ['Ada', 'Chinedu', 'Fatima', 'Emeka', 'Ngozi', 'Tunde', 'Zainab', 'Ibrahim', 'Chioma', 'Yusuf', 'Bola', 'Kelechi'];
const LAST_NAMES = ['Okafor', 'Bello', 'Adeyemi', 'Eze', 'Abubakar', 'Nwosu', 'Sanni', 'Ogun', 'Ibrahim', 'Chukwu'];

async function main() {
  const reset = process.argv.includes('--reset');

  // ---------- School ----------
  let school = await prisma.school.findFirst({ where: { name: SCHOOL_NAME } });
  if (school && reset) {
    console.log('♻️  --reset: wiping existing demo school data...');
    const sId = school.id;
    await prisma.attendance.deleteMany({ where: { schoolId: sId } });
    await prisma.result.deleteMany({ where: { schoolId: sId } });
    await prisma.student.deleteMany({ where: { schoolId: sId } });
    await prisma.arm.deleteMany({ where: { schoolId: sId } });
    await prisma.class.deleteMany({ where: { schoolId: sId } });
    await prisma.subject.deleteMany({ where: { schoolId: sId } });
    await prisma.idGeneratorConfig.deleteMany({ where: { schoolId: sId } });
    await prisma.user.deleteMany({ where: { schoolId: sId } });
    await prisma.school.delete({ where: { id: sId } });
    school = null;
  }

  if (!school) {
    school = await prisma.school.create({ data: { name: SCHOOL_NAME, subdomain: SUBDOMAIN } });
    console.log(`✅ Created school: ${school.name} (${school.id})`);
  } else {
    console.log(`ℹ️  School already exists: ${school.name} (${school.id})`);
  }
  const schoolId = school.id;

  // ---------- Admin user ----------
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { password: await bcrypt.hash(ADMIN_PASSWORD, 10), role: 'ADMIN', schoolId, isActive: true },
    create: {
      name: 'Demo Admin',
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'ADMIN',
      isActive: true,
      schoolId,
    },
  });
  console.log(`✅ Admin user ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  // ---------- Classes & arms ----------
  const armByKey: Record<string, string> = {}; // "JSS 1|A" -> armId
  const classByName: Record<string, string> = {};
  for (const c of CLASSES) {
    let klass = await prisma.class.findFirst({ where: { schoolId, name: c.name } });
    if (!klass) klass = await prisma.class.create({ data: { schoolId, name: c.name } });
    classByName[c.name] = klass.id;
    for (const letter of c.arms) {
      let arm = await prisma.arm.findFirst({ where: { schoolId, classId: klass.id, letter } });
      if (!arm) arm = await prisma.arm.create({ data: { schoolId, classId: klass.id, letter } });
      armByKey[`${c.name}|${letter}`] = arm.id;
    }
  }
  console.log(`✅ Classes & arms ready (${Object.keys(armByKey).length} arms)`);

  // ---------- Subjects ----------
  for (const name of SUBJECT_NAMES) {
    const existing = await prisma.subject.findFirst({ where: { schoolId, name } });
    if (!existing) await prisma.subject.create({ data: { schoolId, name } });
  }
  console.log(`✅ Subjects ready (${SUBJECT_NAMES.length})`);

  // ---------- Demo students (student login via admissionNumber + arm) ----------
  let created = 0;
  let skipped = 0;
  let seq = 1;
  for (const key of Object.keys(armByKey)) {
    const [className, letter] = key.split('|');
    const armId = armByKey[key];
    const classId = classByName[className];
    const armSeqStart = seq; // per-arm numbering keeps names unique across arms
    for (let i = 0; i < 6; i++) {
      const name = `${FIRST_NAMES[(armSeqStart + i) % FIRST_NAMES.length]} ${LAST_NAMES[(armSeqStart * 3 + i) % LAST_NAMES.length]}`;
      const email = `${name.toLowerCase().replace(/\s/g, '.')}@student.demo.school`;
      if (await prisma.user.findUnique({ where: { email } })) { skipped++; seq++; continue; }

      const admissionNumber = `DEMO-${className.replace(/\s/g, '')}${letter}-${String(seq).padStart(3, '0')}`;
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(STUDENT_PASSWORD, 10),
          role: 'STUDENT',
          isActive: true,
          schoolId,
        },
      });
      await prisma.student.create({
        data: {
          name,
          gender: i % 2 === 0 ? 'male' : 'female',
          admissionNumber,
          classId,
          armId,
          userId: user.id,
          schoolId,
        },
      });
      created++;
      seq++;
    }
    seq = armSeqStart + 6; // advance past this arm's 6 students
  }
  console.log(`✅ Demo students: ${created} created, ${skipped} skipped (already present)`);

  console.log('\n────────────────────────────────────────────');
  console.log(`School ID (tenant): ${schoolId}`);
  console.log(`Login (web):        ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('Student logins:     admission number + arm (password: demo1234)');
  console.log('────────────────────────────────────────────');
  console.log('\n⚠️  This is a SEPARATE tenant — live school data is untouched.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
