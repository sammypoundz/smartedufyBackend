import { Request, Response } from 'express';
import { resultService, ResultInput } from '../services/resultService';
import { createResultSchema, updateResultSchema, bulkResultSchema } from '../validations/resultValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

// Schema for pushing test attempts to results
const pushTestAttemptsSchema = z.object({
  testId: z.string(),
  academicYearId: z.string(),
  term: z.string(),
  resultType: z.enum(['ca', 'exam']),
});

export const resultController = {
  /**
   * GET /api/results/history?armId=...
   */
  getHistory: async (req: Request, res: Response) => {
    const armId = req.query.armId as string;
    if (!armId) return res.status(400).json({ error: 'armId is required' });
    try {
      const history = await resultService.getHistory(armId);
      res.json(history);
    } catch (err: any) {
      console.error('Get history error:', err);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  },

  getByStudent: async (req: Request, res: Response) => {
    const studentId = getStringParam(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });
    const term = req.query.term as string | undefined;
    const academicYearId = req.query.academicYearId as string | undefined;
    try {
      const results = await resultService.getByStudentId(studentId, academicYearId, term);
      res.json(results);
    } catch (err: any) {
      console.error('Get results by student error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },

  getByArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    const term = req.query.term as string | undefined;
    const academicYearId = req.query.academicYearId as string | undefined;
    try {
      const results = await resultService.getByArmId(armId, term, academicYearId);
      res.json(results);
    } catch (err: any) {
      console.error('Get results by arm error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },

  getBySubject: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.subjectId);
    if (!subjectId) return res.status(400).json({ error: 'Invalid subjectId' });
    const term = req.query.term as string | undefined;
    const academicYearId = req.query.academicYearId as string | undefined;
    try {
      const results = await resultService.getBySubjectId(subjectId, term, academicYearId);
      res.json(results);
    } catch (err: any) {
      console.error('Get results by subject error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },

  getByFilters: async (req: Request, res: Response) => {
    const armId = req.query.armId as string;
    const subjectId = req.query.subjectId as string | undefined;
    const term = req.query.term as string;
    const academicYearId = req.query.academicYearId as string | undefined;
    if (!armId || !term) {
      return res.status(400).json({ error: 'Missing required query parameters: armId, term' });
    }
    try {
      let results;
      if (subjectId) {
        results = await resultService.getByArmSubjectTerm(armId, subjectId, term, academicYearId);
      } else {
        results = await resultService.getByArmTerm(armId, term, academicYearId);
      }
      res.json(results);
    } catch (err: any) {
      console.error('Get results by filters error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },

  getByAcademicYear: async (req: Request, res: Response) => {
    const academicYearId = getStringParam(req.params.academicYearId);
    if (!academicYearId) return res.status(400).json({ error: 'Invalid academicYearId' });
    try {
      const results = await resultService.getByAcademicYear(academicYearId);
      res.json(results);
    } catch (err: any) {
      console.error('Get results by academic year error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const data = createResultSchema.parse(req.body);
      
      let resultData: ResultInput;
      
      if (data.ca !== undefined && data.exam !== undefined) {
        if (!data.armId) {
          return res.status(400).json({ error: 'armId is required when using ca/exam' });
        }
        const total = data.ca + data.exam;
        resultData = {
          studentId: data.studentId,
          subjectId: data.subjectId,
          armId: data.armId,
          term: data.term,
          ca: data.ca,
          exam: data.exam,
          total,
          grade: data.grade,
          academicYearId: data.academicYearId,
        };
      } else if (data.score !== undefined) {
        return res.status(400).json({ error: 'The "score" field is deprecated. Please use "ca" and "exam" instead.' });
      } else {
        return res.status(400).json({ error: 'Invalid data: provide either (ca+exam) or (score)' });
      }
      
      const result = await resultService.create(resultData);
      res.status(201).json(result);
    } catch (err: any) {
      console.error('Create result error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create result' });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateResultSchema.parse(req.body);
      
      const updatePayload: any = { ...data };
      if (data.ca !== undefined && data.exam !== undefined) {
        const total = data.ca + data.exam;
        updatePayload.total = total;
        updatePayload.score = total;
      } else if (data.total !== undefined) {
        updatePayload.score = data.total;
      } else if (data.score !== undefined) {
        updatePayload.total = data.score;
      }
      
      const updated = await resultService.update(id, updatePayload);
      if (!updated) return res.status(404).json({ error: 'Result not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update result error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update result' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await resultService.delete(id);
      res.json({ message: 'Result deleted' });
    } catch (err: any) {
      console.error('Delete result error:', err);
      res.status(500).json({ error: 'Failed to delete result' });
    }
  },

  bulkUpsert: async (req: Request, res: Response) => {
    try {
      const { results } = bulkResultSchema.parse(req.body);
      const updated = await resultService.bulkUpsert(results);
      res.status(200).json({ message: `${updated.length} results saved` });
    } catch (err: any) {
      console.error('Bulk upsert error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to save results' });
    }
  },

  pushTestAttemptsToResults: async (req: Request, res: Response) => {
    try {
      const data = pushTestAttemptsSchema.parse(req.body);
      const result = await resultService.pushTestAttemptsToResults(data);
      res.json({ message: `Successfully pushed ${result.count} results to ${data.resultType}` });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error('Push test attempts error:', err);
      // If the error message indicates a missing test or no attempts, return 404
      if (err.message === 'Test not found' || err.message === 'No attempts found for this test') {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message || 'Failed to push results' });
    }
  },
};