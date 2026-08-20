import { Request, Response } from 'express';
import { testAttemptService } from '../services/testAttemptService';
import { getStringParam } from '../utils/paramUtils';
import prisma from '../config/db'; // ✅ import prisma

export const testAttemptController = {
  submit: async (req: Request, res: Response) => {
    const { testId, studentId, answers, startedAt, submittedAt } = req.body;

    if (!testId || !studentId || !answers) {
      return res.status(400).json({ error: 'Missing required fields: testId, studentId, answers' });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    try {
      const result = await testAttemptService.submit({
        testId,
        studentId,
        answers,
        startedAt: new Date(startedAt),
        submittedAt: new Date(submittedAt),
      });
      res.json(result);
    } catch (err: any) {
      console.error('Submit test attempt error:', err);
      res.status(500).json({ error: 'Failed to submit test' });
    }
  },

  // Get all attempts for a test (admin/teacher only)
  getByTestId: async (req: Request, res: Response) => {
    const testId = getStringParam(req.params.testId);
    if (!testId) return res.status(400).json({ error: 'Invalid testId' });

    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'TEACHER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const attempts = await testAttemptService.getByTestId(testId);
      res.json(attempts);
    } catch (err: any) {
      console.error('Get attempts by test error:', err);
      res.status(500).json({ error: 'Failed to fetch test attempts' });
    }
  },

  // Get attempts for a specific student (self or admin/teacher)
  getByStudentId: async (req: Request, res: Response) => {
    const studentId = getStringParam(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });

    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    // If the requester is a student, ensure they are requesting their own data
    if (userRole === 'STUDENT') {
      const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
      if (!student || student.id !== studentId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (userRole !== 'ADMIN' && userRole !== 'TEACHER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const attempts = await testAttemptService.getByStudentId(studentId);
      res.json(attempts);
    } catch (err: any) {
      console.error('Get attempts by student error:', err);
      res.status(500).json({ error: 'Failed to fetch student attempts' });
    }
  },
};