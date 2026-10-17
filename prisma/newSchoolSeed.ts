/// <reference types="node" />

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed for Golden Light School...');

  const SEED_SUBDOMAIN = 'goldenlight';

  // ---------- School-scoped cleanup ----------
  // SAFETY: only delete data belonging to Golden Light School (by subdomain).
  // Other schools' data in the shared database is NEVER touched.
  const existingSchool = await prisma.school.findUnique({ where: { subdomain: SEED_SUBDOMAIN } });

  if (existingSchool) {
    const schoolId = existingSchool.id;
    console.log(`🗑️ Clearing data for school "${existingSchool.name}" (${SEED_SUBDOMAIN}) only...`);

    // Delete records that reference schools – all scoped to this school only
    await prisma.message.deleteMany({ where: { schoolId } });
    await prisma.testAttempt.deleteMany({ where: { schoolId } });
    await prisma.question.deleteMany({ where: { schoolId } });
    await prisma.questionDoc.deleteMany({ where: { schoolId } });
    await prisma.test.deleteMany({ where: { schoolId } });
    await prisma.studentPromotionHistory.deleteMany({ where: { schoolId } });
    await prisma.result.deleteMany({ where: { schoolId } });
    await prisma.feePayment.deleteMany({ where: { schoolId } });
    await prisma.studentFee.deleteMany({ where: { schoolId } });
    await prisma.feeStructure.deleteMany({ where: { schoolId } });
    await prisma.payroll.deleteMany({ where: { schoolId } });
    await prisma.budget.deleteMany({ where: { schoolId } });
    await prisma.expense.deleteMany({ where: { schoolId } });
    await prisma.timetableEntry.deleteMany({ where: { schoolId } });
    await prisma.timetableReview.deleteMany({ where: { schoolId } });
    await prisma.teacherSlotPreference.deleteMany({ where: { schoolId } });
    await prisma.teacherSubjectAssignment.deleteMany({ where: { schoolId } });
    await prisma.topic.deleteMany({ where: { schoolId } });
    await prisma.lessonPlan.deleteMany({ where: { schoolId } });
    await prisma.assessmentFormat.deleteMany({ where: { schoolId } });
    await prisma.studentSubject.deleteMany({ where: { schoolId } });
    await prisma.attendance.deleteMany({ where: { schoolId } });
    await prisma.subjectArm.deleteMany({ where: { schoolId } });
    await prisma.subjectTeacher.deleteMany({ where: { schoolId } });
    await prisma.armSkill.deleteMany({ where: { schoolId } });
    await prisma.subjectSkill.deleteMany({ where: { schoolId } });
    await prisma.skill.deleteMany({ where: { schoolId } });
    await prisma.subject.deleteMany({ where: { schoolId } });
    await prisma.arm.deleteMany({ where: { schoolId } });
    await prisma.class.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.parentStudentLink.deleteMany({ where: { schoolId } });
    await prisma.teacher.deleteMany({ where: { schoolId } });
    await prisma.parent.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({ where: { schoolId } });
    await prisma.gradingScale.deleteMany({ where: { schoolId } });
    await prisma.gradingScaleGroup.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
    await prisma.promotionRule.deleteMany({ where: { schoolId } });
    await prisma.reportCardTemplate.deleteMany({ where: { schoolId } });
    await prisma.idGeneratorConfig.deleteMany({ where: { schoolId } });
    await prisma.inventoryItem.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.roleDef.deleteMany({ where: { schoolId } });

    // Delete BankDetail before School (important!)
    await prisma.bankDetail.deleteMany({ where: { schoolId } });
    console.log('✅ Deleted bank details');

    await prisma.school.delete({ where: { id: schoolId } });
    console.log('✅ Target school data cleared (other schools untouched)');
  } else {
    console.log('ℹ️ No existing "goldenlight" school found – nothing to clear');
  }

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