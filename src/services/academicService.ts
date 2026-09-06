import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

// ---------- Private helpers ----------
/**
 * Compute a grade for a score. If an armId/classId context is provided, the
 * grading scale group assigned to that class is used; otherwise the school-wide
 * scales (grades with no group) are used.
 */
async function computeGrade(score: number, classId?: string | null): Promise<string> {
  let scales;
  if (classId) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { gradingScaleGroupId: true },
    });
    if (cls?.gradingScaleGroupId) {
      scales = await prisma.gradingScale.findMany({
        where: { groupId: cls.gradingScaleGroupId },
        orderBy: { minScore: 'desc' },
      });
    }
  }
  if (!scales) {
    // Fallback: school-wide scale (grades not attached to any group)
    scales = await prisma.gradingScale.findMany({
      where: { groupId: null },
      orderBy: { minScore: 'desc' },
    });
    // Legacy compat: if no ungrouped grades exist, fall back to all scales
    if (scales.length === 0) {
      scales = await prisma.gradingScale.findMany({ orderBy: { minScore: 'desc' } });
    }
  }
  for (const scale of scales) {
    if (score >= scale.minScore && score <= scale.maxScore) {
      return scale.grade;
    }
  }
  return 'F';
}

async function getOrCreateCbtSubject(): Promise<string> {
  const tenantId = getCurrentTenantId();
  if (!tenantId) throw new Error('Tenant context missing');

  const cbtSubject = await prisma.subject.findFirst({
    where: {
      name: 'CBT',
      schoolId: tenantId, // scope to current tenant
    },
  });
  if (cbtSubject) return cbtSubject.id;

  const newSubject = await prisma.subject.create({
    data: {
      name: 'CBT',
      description: 'Computer-Based Test results',
      schoolId: tenantId,
    },
  });
  return newSubject.id;
}

// ---------- Service ----------
export const academicService = {
  // --- Grading scales ---
  // Only the school-wide (ungrouped) scales; group-specific grades are served
  // via /grading-scale-groups and used per-class.
  getGradingScales: () =>
    prisma.gradingScale.findMany({
      where: { groupId: null },
      orderBy: { minScore: 'desc' },
    }), // middleware adds schoolId

  saveGradingScales: async (
    scales: { grade: string; min: number; max: number }[],
    groupId?: string | null
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const where = groupId ? { schoolId: tenantId, groupId } : { schoolId: tenantId, groupId: null };
    await prisma.gradingScale.deleteMany({ where });
    for (const scale of scales) {
      await prisma.gradingScale.create({
        data: {
          grade: scale.grade,
          minScore: scale.min,
          maxScore: scale.max,
          groupId: groupId || null,
          schoolId: tenantId,
        },
      });
    }
    return { count: scales.length };
  },

  // --- Grading scale groups ---
  getGradingScaleGroups: () =>
    prisma.gradingScaleGroup.findMany({
      include: { grades: { orderBy: { minScore: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    }),

  createGradingScaleGroup: async (name: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.gradingScaleGroup.create({
      data: { name, schoolId: tenantId },
      include: { grades: true },
    });
  },

  updateGradingScaleGroup: async (id: string, name: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.gradingScaleGroup.update({
      where: { id, schoolId: tenantId },
      data: { name },
      include: { grades: { orderBy: { minScore: 'desc' } } },
    });
  },

  deleteGradingScaleGroup: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const group = await prisma.gradingScaleGroup.findFirst({
      where: { id, schoolId: tenantId },
      include: { _count: { select: { classes: true } } },
    });
    if (!group) throw new Error('Grading scale group not found');
    if (group._count.classes > 0) {
      throw new Error(
        `Cannot delete: ${group._count.classes} class(es) still use this grading scale group`
      );
    }
    await prisma.gradingScale.deleteMany({ where: { groupId: id, schoolId: tenantId } });
    await prisma.gradingScaleGroup.delete({ where: { id, schoolId: tenantId } });
    return { success: true };
  },

  assignGradingScaleGroupToClass: async (classId: string, groupId: string | null) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.class.update({
      where: { id: classId, schoolId: tenantId },
      data: { gradingScaleGroupId: groupId },
    });
  },

  // --- Academic Years & Terms ---
  getAllAcademicYears: () =>
    prisma.academicYear.findMany({
      include: { terms: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }), // middleware adds schoolId

  getCurrentSession: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true, schoolId: tenantId },
      include: { terms: true },
    });
    if (!activeYear) return { year: null, term: null };

    let activeTerm = null;
    const termSetting = await prisma.globalSetting.findUnique({
      where: { key: 'activeTermId' },
    });
    if (termSetting && termSetting.value) {
      activeTerm = activeYear.terms.find((t) => t.id === termSetting.value) || null;
    }
    if (!activeTerm && activeYear.terms.length) {
      activeTerm = activeYear.terms[0];
    }
    return { year: activeYear, term: activeTerm };
  },

  setCurrentSession: async (yearId: string, termId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Deactivate all other academic years for this tenant
    await prisma.academicYear.updateMany({
      where: { schoolId: tenantId },
      data: { isActive: false },
    });
    // Activate the selected year (ensure it belongs to the tenant)
    await prisma.academicYear.update({
      where: { id: yearId, schoolId: tenantId },
      data: { isActive: true },
    });
    // Update the global setting (activeTermId) – this is global for now
    // If you want per‑tenant, add schoolId to GlobalSetting later.
    await prisma.globalSetting.upsert({
      where: { key: 'activeTermId' },
      update: { value: termId },
      create: { key: 'activeTermId', value: termId },
    });
    return { yearId, termId };
  },

  createAcademicYear: async (name: string, termNames: string[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const year = await prisma.academicYear.create({
      data: {
        name,
        schoolId: tenantId,
        terms: {
          create: termNames.map((name, idx) => ({ name, order: idx + 1, schoolId: tenantId })),
        },
      },
      include: { terms: true },
    });
    return year;
  },

  // --- Push test attempt scores to student results (CA or Exam) ---
  pushTestAttemptsToResults: async (data: {
    testId: string;
    academicYearId: string;
    term: string;
    resultType: 'ca' | 'exam';
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Get the test (ensure it belongs to the tenant)
    const test = await prisma.test.findUnique({
      where: { id: data.testId, schoolId: tenantId },
      select: { armId: true, name: true, arm: { select: { classId: true } } },
    });
    if (!test) throw new Error('Test not found');

    // 2. Get or create a CBT subject (tenant‑aware)
    const subjectId = await getOrCreateCbtSubject();

    // 3. Get all attempts for this test
    const attempts = await prisma.testAttempt.findMany({
      where: { testId: data.testId },
      include: { student: { select: { id: true } } },
    });
    if (attempts.length === 0) throw new Error('No attempts found for this test');

    // 4. Prepare result records
    const resultsData = await Promise.all(attempts.map(async (attempt) => {
      const score = attempt.score;
      const grade = await computeGrade(score, test.arm?.classId);
      return {
        studentId: attempt.studentId,
        subjectId,
        armId: test.armId,
        term: data.term,
        ca: data.resultType === 'ca' ? score : 0,
        exam: data.resultType === 'exam' ? score : 0,
        total: attempt.total,
        score,
        grade,
        academicYearId: data.academicYearId,
        schoolId: tenantId, // include for create/upsert
      };
    }));

    // 5. Upsert results in a transaction
    await prisma.$transaction(
      resultsData.map(result =>
        prisma.result.upsert({
          where: {
            studentId_subjectId_armId_term_academicYearId: {
              studentId: result.studentId,
              subjectId: result.subjectId,
              armId: result.armId,
              term: result.term,
              academicYearId: result.academicYearId,
            },
          },
          update: {
            ca: result.ca,
            exam: result.exam,
            total: result.total,
            score: result.score,
            grade: result.grade,
          },
          create: {
            studentId: result.studentId,
            subjectId: result.subjectId,
            armId: result.armId,
            term: result.term,
            ca: result.ca,
            exam: result.exam,
            total: result.total,
            score: result.score,
            grade: result.grade,
            academicYearId: result.academicYearId,
            schoolId: result.schoolId,
          },
        })
      )
    );

    return { count: attempts.length };
  },
};