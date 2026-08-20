import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const testAttemptService = {
  submit: async (data: {
    testId: string;
    studentId: string;
    answers: Array<{ questionId: string; selectedOption: number }>;
    startedAt: Date;
    submittedAt: Date;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const questions = await prisma.question.findMany({
      where: { testId: data.testId },
    });

    let correctCount = 0;
    for (const answer of data.answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (question && question.correctOption === answer.selectedOption) {
        correctCount++;
      }
    }
    const total = questions.length;
    const percentage = total === 0 ? 0 : (correctCount / total) * 100;

    const attempt = await prisma.testAttempt.create({
      data: {
        testId: data.testId,
        studentId: data.studentId,
        answers: JSON.stringify(data.answers),
        score: correctCount,
        total,
        percentage,
        startedAt: data.startedAt,
        submittedAt: data.submittedAt,
        schoolId: tenantId,
      },
    });

    return { score: correctCount, total, percentage };
  },

  // Get all attempts for a test, with student details and computed fields
  getByTestId: async (testId: string) => {
    // middleware adds schoolId to the where clause automatically
    const attempts = await prisma.testAttempt.findMany({
      where: { testId },
      include: {
        student: {
          select: {
            name: true,
            admissionNumber: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return attempts.map(attempt => {
      let completed = false;
      try {
        const answersArray = JSON.parse(attempt.answers as string) as Array<{ selectedOption: number }>;
        completed = answersArray.every(a => a.selectedOption !== -1);
      } catch {
        completed = false;
      }

      const timeTakenSeconds = (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000;

      return {
        id: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.student.name,
        admissionNumber: attempt.student.admissionNumber,
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        completed,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        timeTakenSeconds,
      };
    });
  },

  // Get all attempts for a specific student, with test details
  getByStudentId: async (studentId: string) => {
    // middleware adds schoolId to the where clause automatically
    const attempts = await prisma.testAttempt.findMany({
      where: { studentId },
      include: {
        test: {
          select: {
            id: true,
            name: true,
            duration: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return attempts.map(attempt => {
      let completed = false;
      try {
        const answersArray = JSON.parse(attempt.answers as string) as Array<{ selectedOption: number }>;
        completed = answersArray.every(a => a.selectedOption !== -1);
      } catch {
        completed = false;
      }

      const timeTakenSeconds = (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000;

      return {
        id: attempt.id,
        testId: attempt.testId,
        testName: attempt.test.name,
        testDuration: attempt.test.duration,
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        completed,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        timeTakenSeconds,
      };
    });
  },
};