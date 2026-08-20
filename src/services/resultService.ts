import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export interface ResultInput {
  studentId: string;
  subjectId: string;
  armId: string;
  term: string;
  ca: number;
  exam: number;
  total: number;
  grade?: string;
  academicYearId?: string;
}

// ---------- Private helpers ----------
async function computeGrade(score: number): Promise<string> {
  const scales = await prisma.gradingScale.findMany({ orderBy: { minScore: 'desc' } });
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
    where: { name: 'CBT', schoolId: tenantId },
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

export const resultService = {
  /**
   * Get results for a specific student, optionally filtered by academicYearId and term.
   */
  getByStudentId: (studentId: string, academicYearId?: string, term?: string) =>
    prisma.result.findMany({
      where: {
        studentId,
        ...(academicYearId && { academicYearId }),
        ...(term && { term }),
      },
      include: { subject: true, arm: true },
      orderBy: { term: 'desc' },
    }), // middleware adds schoolId

  /**
   * Get results for all students in an arm, optionally filtered by term and academicYearId.
   */
  getByArmId: (armId: string, term?: string, academicYearId?: string) =>
    prisma.result.findMany({
      where: {
        armId,
        ...(term && { term }),
        ...(academicYearId && { academicYearId }),
      },
      include: { student: true, subject: true },
      orderBy: [{ term: 'desc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId

  /**
   * Get results for a subject across all arms, optionally filtered by term and academicYearId.
   */
  getBySubjectId: (subjectId: string, term?: string, academicYearId?: string) =>
    prisma.result.findMany({
      where: {
        subjectId,
        ...(term && { term }),
        ...(academicYearId && { academicYearId }),
      },
      include: { student: true, subject: true },
      orderBy: [{ term: 'desc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId

  /**
   * Get results by arm, subject, term, and academicYearId (used by the result compiler and reports page).
   */
  getByArmSubjectTerm: async (armId: string, subjectId: string, term: string, academicYearId?: string) => {
    return prisma.result.findMany({
      where: {
        armId,
        subjectId,
        term,
        ...(academicYearId && { academicYearId }),
      },
      select: {
        studentId: true,
        subjectId: true,
        ca: true,
        exam: true,
        total: true,
        grade: true,
      },
    }); // middleware adds schoolId
  },

  /**
   * Get results for an arm and term (all subjects) – used by the broadsheet.
   */
  getByArmTerm: async (armId: string, term: string, academicYearId?: string) => {
    return prisma.result.findMany({
      where: {
        armId,
        term,
        ...(academicYearId && { academicYearId }),
      },
      select: {
        studentId: true,
        subjectId: true,
        total: true,
        grade: true,
      },
    }); // middleware adds schoolId
  },

  /**
   * Get all results for a specific academic year.
   */
  getByAcademicYear: (academicYearId: string) =>
    prisma.result.findMany({
      where: { academicYearId },
      include: { student: true, subject: true, arm: true },
      orderBy: [{ term: 'asc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId

  /**
   * Get compilation history for an arm (distinct academic year + term pairs).
   */
  getHistory: async (armId: string) => {
    const history = await prisma.result.findMany({
      where: { armId },
      select: {
        academicYearId: true,
        term: true,
        academicYear: { select: { name: true } },
      },
      distinct: ['academicYearId', 'term'],
      orderBy: [
        { academicYear: { name: 'desc' } },
        { term: 'asc' },
      ],
    }); // middleware adds schoolId
    return history.map(h => ({
      academicYearId: h.academicYearId,
      academicYearName: h.academicYear?.name || 'Unknown',
      term: h.term,
    }));
  },

  /**
   * Create a single result (includes academicYearId if provided).
   */
  create: async (data: ResultInput) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.result.create({
      data: {
        ...data,
        score: data.total,
        schoolId: tenantId,
      },
    });
  },

  /**
   * Update an existing result.
   */
  update: async (id: string, data: { ca?: number; exam?: number; total?: number; grade?: string; academicYearId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updateData: any = { ...data };
    if (data.total !== undefined) {
      updateData.score = data.total;
    }
    return prisma.result.update({
      where: { id, schoolId: tenantId },
      data: updateData,
    });
  },

  /**
   * Delete a result.
   */
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.result.delete({
      where: { id, schoolId: tenantId },
    });
  },

  /**
   * Bulk upsert results – uses the updated unique constraint (includes academicYearId).
   */
  bulkUpsert: async (results: ResultInput[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const operations = results.map(result =>
      prisma.result.upsert({
        where: {
          studentId_subjectId_armId_term_academicYearId: {
            studentId: result.studentId,
            subjectId: result.subjectId,
            armId: result.armId,
            term: result.term,
            academicYearId: result.academicYearId!,
          },
        },
        update: {
          ca: result.ca,
          exam: result.exam,
          total: result.total,
          grade: result.grade,
          score: result.total,
          academicYearId: result.academicYearId,
        },
        create: {
          ...result,
          score: result.total,
          schoolId: tenantId,
        },
      })
    );
    return await prisma.$transaction(operations);
  },

  /**
   * Push test attempt scores to student results (CA or Exam)
   * Also links the CBT subject to the arm so it appears in the result compiler.
   */
  pushTestAttemptsToResults: async (data: {
    testId: string;
    academicYearId: string;
    term: string;
    resultType: 'ca' | 'exam';
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Get the test to retrieve armId (ensure it belongs to tenant)
    const test = await prisma.test.findUnique({
      where: { id: data.testId, schoolId: tenantId },
      select: { armId: true, name: true },
    });
    if (!test) throw new Error('Test not found');

    // 2. Get or create a CBT subject (tenant-aware)
    const subjectId = await getOrCreateCbtSubject();

    // Ensure the CBT subject is linked to the arm
    const existingLink = await prisma.subjectArm.findFirst({
      where: { armId: test.armId, subjectId, schoolId: tenantId },
    });
    if (!existingLink) {
      await prisma.subjectArm.create({
        data: {
          armId: test.armId,
          subjectId,
          teacherId: null,
          schoolId: tenantId,
        },
      });
      console.log(`✅ CBT subject linked to arm ${test.armId}`);
    }

    // 3. Get all attempts for this test with student details (already tenant-scoped via Test)
    const attempts = await prisma.testAttempt.findMany({
      where: { testId: data.testId },
      include: { student: { select: { id: true } } },
    });
    if (attempts.length === 0) throw new Error('No attempts found for this test');

    // 4. Prepare result records with computed grades
    const resultsData = await Promise.all(attempts.map(async (attempt) => {
      const score = attempt.score;
      const grade = await computeGrade(score);
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
        schoolId: tenantId,
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