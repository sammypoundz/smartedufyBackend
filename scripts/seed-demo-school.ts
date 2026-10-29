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
const TEACHER_PASSWORD = 'demo1234';
const PARENT_PASSWORD = 'demo1234';

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

  // ---------- Demo teachers (one per arm, as form teacher + subject teacher) ----------
  const subjectRows = await prisma.subject.findMany({ where: { schoolId } });
  let teacherIndex = 0;
  for (const key of Object.keys(armByKey)) {
    const [className, letter] = key.split('|');
    teacherIndex++;
    const teacherEmail = `teacher${teacherIndex}@demo.school`;
    const existingTeacherUser = await prisma.user.findUnique({ where: { email: teacherEmail } });
    let teacherRow: { id: string } | null = null;
    if (existingTeacherUser) {
      teacherRow = await prisma.teacher.findUnique({ where: { userId: existingTeacherUser.id } });
    } else {
      const teacherName = `Mr. ${LAST_NAMES[(teacherIndex * 2) % LAST_NAMES.length]}`;
      const teacherUser = await prisma.user.create({
        data: {
          name: teacherName,
          email: teacherEmail,
          password: await bcrypt.hash(TEACHER_PASSWORD, 10),
          role: 'TEACHER',
          roles: ['TEACHER'],
          isActive: true,
          schoolId,
        },
      });
      teacherRow = await prisma.teacher.create({
        data: {
          name: teacherName,
          email: teacherEmail,
          gender: teacherIndex % 2 === 0 ? 'FEMALE' : 'MALE',
          teacherType: 'BOTH',
          registrationStatus: 'APPROVED',
          userId: teacherUser.id,
          schoolId,
        },
      });
    }
    if (!teacherRow) continue;

    const armId = armByKey[key];
    // Link teacher as form teacher of the arm
    await prisma.arm.update({ where: { id: armId }, data: { teacherId: teacherRow.id } });

    // Teach the first two subjects in this arm
    const armSubjects = subjectRows.slice(0, 2);
    for (const subject of armSubjects) {
      await prisma.subjectTeacher.upsert({
        where: { schoolId_subjectId_teacherId: { schoolId, subjectId: subject.id, teacherId: teacherRow.id } },
        update: {},
        create: { schoolId, subjectId: subject.id, teacherId: teacherRow.id },
      });
      await prisma.subjectArm.upsert({
        where: { schoolId_subjectId_armId: { schoolId, subjectId: subject.id, armId } },
        update: { teacherId: teacherRow.id },
        create: { schoolId, subjectId: subject.id, armId, teacherId: teacherRow.id },
      });
      await prisma.teacherSubjectAssignment.upsert({
        where: { schoolId_subjectId_armId: { schoolId, subjectId: subject.id, armId } },
        update: {},
        create: {
          schoolId,
          subjectId: subject.id,
          armId,
          teacherId: teacherRow.id,
          periodsPerWeek: 2,
          allowedDays: ['Monday', 'Wednesday'],
        },
      });
    }
    console.log(`✅ Teacher ready: ${teacherEmail} — form teacher of ${className} ${letter}`);
  }

  // ---------- Demo parents (one parent account per student's family group) ----------
  // Give the first two students of each arm a shared parent, so the parent
  // login demonstrates a multi-child (cross-class) link.
  const demoStudents = await prisma.student.findMany({
    where: { schoolId },
    include: { arm: { include: { class: true } } },
    orderBy: { createdAt: 'asc' },
  });
  let parentIndex = 0;
  for (const key of Object.keys(armByKey)) {
    const [className, letter] = key.split('|');
    const armId = armByKey[key];
    const armStudents = demoStudents.filter((s) => s.armId === armId);
    if (armStudents.length < 2) continue;

    parentIndex++;
    const parentEmail = `parent${parentIndex}@demo.school`;
    const parentName = `Mrs. ${LAST_NAMES[(parentIndex * 4) % LAST_NAMES.length]}`;

    let parentUser = await prisma.user.findUnique({ where: { email: parentEmail } });
    if (!parentUser) {
      parentUser = await prisma.user.create({
        data: {
          name: parentName,
          email: parentEmail,
          password: await bcrypt.hash(PARENT_PASSWORD, 10),
          role: 'PARENT',
          roles: ['PARENT'],
          isActive: true,
          schoolId,
        },
      });
    }
    let parentRow = await prisma.parent.findUnique({ where: { userId: parentUser.id } });
    if (!parentRow) {
      parentRow = await prisma.parent.create({
        data: { name: parentName, email: parentEmail, userId: parentUser.id, schoolId },
      });
    }

    // Link first two students of the arm to this parent
    for (const student of armStudents.slice(0, 2)) {
      await prisma.student.update({
        where: { id: student.id },
        data: { parentId: parentRow.id, guardianRelationship: 'mother' },
      });
      // Pre-approve the link request so the parent dashboard works out of the box
      const existingLink = await prisma.parentStudentLink.findFirst({
        where: { parentId: parentRow.id, studentId: student.id },
      });
      if (!existingLink) {
        await prisma.parentStudentLink.create({
          data: {
            schoolId,
            parentId: parentRow.id,
            studentId: student.id,
            status: 'APPROVED',
            requestedName: student.name,
          },
        });
      }
    }
    const childNames = armStudents.slice(0, 2).map((s) => s.name).join(', ');
    console.log(`✅ Parent ready: ${parentEmail} — children: ${childNames} (${className} ${letter})`);
  }

  console.log('\n────────────────────────────────────────────');
  console.log(`School ID (tenant): ${schoolId}`);
  console.log(`Login (web):        ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('Student logins:     admission number + arm (password: demo1234)');
  console.log('Teacher logins:     teacher1@demo.school ... (password: demo1234)');
  console.log('Parent logins:      parent1@demo.school ... (password: demo1234)');
  console.log('────────────────────────────────────────────');
  console.log('\n⚠️  This is a SEPARATE tenant — live school data is untouched.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
