/// <reference types="node" />

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed for Golden Light School...');

  // ---------- Clean up existing data ----------
  console.log('🗑️ Cleaning up existing data...');
  
  // Delete all data from all tables (in correct order - respecting foreign key constraints)
  
  // 1. Delete records that reference schools
  await prisma.message.deleteMany({});
  await prisma.testAttempt.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.test.deleteMany({});
  await prisma.studentPromotionHistory.deleteMany({});
  await prisma.result.deleteMany({});
  await prisma.feePayment.deleteMany({});
  await prisma.studentFee.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.timetableEntry.deleteMany({});
  await prisma.topic.deleteMany({});
  await prisma.lessonPlan.deleteMany({});
  await prisma.assessmentFormat.deleteMany({});
  await prisma.studentSubject.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.subjectArm.deleteMany({});
  await prisma.subjectTeacher.deleteMany({});
  await prisma.armSkill.deleteMany({});
  await prisma.subjectSkill.deleteMany({});
  await prisma.skill.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.arm.deleteMany({});
  await prisma.class.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.teacher.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.gradingScale.deleteMany({});
  await prisma.term.deleteMany({});
  await prisma.academicYear.deleteMany({});
  await prisma.globalSetting.deleteMany({});
  
  // Delete BankDetail before School (important!)
  await prisma.bankDetail.deleteMany({});
  console.log('✅ Deleted bank details');
  
  await prisma.school.deleteMany({});
  console.log('✅ Database cleaned');

  // ---------- Create School ----------
  console.log('🏫 Creating Golden Light School...');
  const school = await prisma.school.create({
    data: {
      name: 'Golden Light School',
      subdomain: 'goldenlight',
      isActive: true,
    },
  });
  console.log(`✅ School created: ${school.name} (${school.subdomain})`);

  // ---------- Create Admin ----------
  console.log('👤 Creating admin account...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      schoolId: school.id,
      email: 'admin@goldenlight.com',
      password: hashedPassword,
      role: 'ADMIN',
      name: 'Golden Light Admin',
      phone: '+1234567899',
      isActive: true,
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('📋 Login Credentials:');
  console.log('  School: Golden Light School');
  console.log('  Subdomain: goldenlight');
  console.log('  Admin Email: admin@goldenlight.com');
  console.log('  Admin Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());