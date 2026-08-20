// scripts/assign-default-school.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Helper: convert PascalCase to camelCase (e.g., "ArmSkill" -> "armSkill")
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

async function main() {
  // 1. Create default school
  const defaultSchool = await prisma.school.upsert({
    where: { subdomain: 'default' },
    update: {},
    create: { name: 'Default School', subdomain: 'default' },
  });
  console.log('✅ Default school created:', defaultSchool.id);

  // 2. List all tenant-aware models (add all models that have schoolId)
  const models = [
    'User', 'Student', 'Teacher', 'Parent', 'Class', 'Arm', 'Subject',
    'SubjectArm', 'SubjectTeacher', 'StudentSubject', // joins
    'Result', 'Attendance', 'TimetableEntry',
    'Topic', 'LessonPlan', 'FeeStructure', 'FeePayment', 'StudentFee',
    'Message', 'Expense', 'Budget', 'Payroll', 'Test', 'Question',
    'TestAttempt', 'StudentPromotionHistory', 'AcademicYear', 'Term',
    'Skill', 'ArmSkill', 'SubjectSkill', 'GradingScale', 'AssessmentFormat',
  ];

  for (const modelName of models) {
    const modelKey = toCamelCase(modelName);
    // @ts-ignore – dynamic access
    const model = prisma[modelKey];
    if (!model) {
      console.warn(`⚠️ Model ${modelName} not found, skipping.`);
      continue;
    }
    try {
      // @ts-ignore – dynamic updateMany
      await model.updateMany({
        data: { schoolId: defaultSchool.id },
      });
      console.log(`✅ Updated ${modelName}`);
    } catch (err: any) {
      console.error(`❌ Failed to update ${modelName}:`, err.message);
    }
  }

  console.log('🎉 All records assigned to default school');
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());