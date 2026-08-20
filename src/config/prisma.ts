// src/config/prisma.ts
import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '../utils/tenantContext';

// Complete list of models that have a `schoolId` field
const TENANT_MODELS = [
  'User', 'Student', 'Teacher', 'Parent', 'Class', 'Arm', 'Subject',
  'SubjectArm', 'SubjectTeacher', 'StudentSubject',
  'Skill', 'ArmSkill', 'SubjectSkill',
  'GradingScale', 'AssessmentFormat',
  'Result', 'Attendance', 'TimetableEntry', 'Topic', 'LessonPlan',
  'FeeStructure', 'FeePayment', 'StudentFee',
  'Message', 'Expense', 'Budget', 'Payroll',
  'Test', 'Question', 'TestAttempt',
  'StudentPromotionHistory', 'AcademicYear', 'Term',
];

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  // Guard: only proceed if model is defined and is tenant-aware
  if (!params.model || !TENANT_MODELS.includes(params.model)) {
    return next(params);
  }

  const tenantId = getCurrentTenantId();

  // ⚠️ No tenant context – skip filtering.
  // This allows public routes (login/register) to work without a tenant header.
  if (!tenantId) {
    return next(params);
  }

  // ----- READ operations -----
  if (['findMany', 'findUnique', 'findFirst', 'count', 'aggregate'].includes(params.action)) {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    if (!params.args.where.schoolId) {
      params.args.where.schoolId = tenantId;
    }
    return next(params);
  }

  // ----- CREATE -----
  if (params.action === 'create') {
    if (!params.args) params.args = {};
    if (!params.args.data) params.args.data = {};
    if (params.args.data.schoolId && params.args.data.schoolId !== tenantId) {
      throw new Error('Cannot create record for a different tenant');
    }
    params.args.data.schoolId = tenantId;
    return next(params);
  }

  // ----- UPDATE -----
  if (params.action === 'update') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.schoolId = tenantId;
    if (params.args.data?.schoolId && params.args.data.schoolId !== tenantId) {
      throw new Error('Cannot change tenant ownership');
    }
    if (params.args.data) {
      delete params.args.data.schoolId;
    }
    return next(params);
  }

  // ----- UPDATE MANY -----
  if (params.action === 'updateMany') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.schoolId = tenantId;
    if (params.args.data) {
      delete params.args.data.schoolId;
    }
    return next(params);
  }

  // ----- UPSERT -----
  if (params.action === 'upsert') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.schoolId = tenantId;
    if (!params.args.create) params.args.create = {};
    if (params.args.create.schoolId && params.args.create.schoolId !== tenantId) {
      throw new Error('Cannot upsert record for a different tenant');
    }
    params.args.create.schoolId = tenantId;
    if (params.args.update) {
      delete params.args.update.schoolId;
    }
    return next(params);
  }

  // ----- DELETE -----
  if (params.action === 'delete') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.schoolId = tenantId;
    return next(params);
  }

  // ----- DELETE MANY -----
  if (params.action === 'deleteMany') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    params.args.where.schoolId = tenantId;
    return next(params);
  }

  return next(params);
});

export { prisma };