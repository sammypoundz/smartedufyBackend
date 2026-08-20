import { Request, Response } from 'express';
import { academicService } from '../services/academicService';
import { z } from 'zod';

const gradingScalesSchema = z.object({
  scales: z.array(z.object({
    grade: z.string(),
    min: z.number(),
    max: z.number(),
  })),
});

const academicYearSchema = z.object({
  name: z.string(),
  terms: z.array(z.string()),
});

const setSessionSchema = z.object({
  yearId: z.string(),
  termId: z.string(),
});

// Schema for pushing test attempts
const pushTestAttemptsSchema = z.object({
  testId: z.string(),
  academicYearId: z.string(),
  term: z.string(),
  resultType: z.enum(['ca', 'exam']),
});

export const academicController = {
  // Grading scales
  getGradingScales: async (req: Request, res: Response) => {
    try {
      const scales = await academicService.getGradingScales();
      res.json(scales);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch grading scales' });
    }
  },

  saveGradingScales: async (req: Request, res: Response) => {
    try {
      const { scales } = gradingScalesSchema.parse(req.body);
      await academicService.saveGradingScales(scales);
      res.json({ success: true });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to save grading scales' });
    }
  },

  // Academic years
  getAcademicYears: async (req: Request, res: Response) => {
    try {
      const years = await academicService.getAllAcademicYears();
      res.json(years);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch academic years' });
    }
  },

  createAcademicYear: async (req: Request, res: Response) => {
    try {
      const { name, terms } = academicYearSchema.parse(req.body);
      const year = await academicService.createAcademicYear(name, terms);
      res.status(201).json(year);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to create academic year' });
    }
  },

  // Current session
  getCurrentSession: async (req: Request, res: Response) => {
    try {
      const session = await academicService.getCurrentSession();
      res.json(session);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch current session' });
    }
  },

  setCurrentSession: async (req: Request, res: Response) => {
    try {
      const { yearId, termId } = setSessionSchema.parse(req.body);
      await academicService.setCurrentSession(yearId, termId);
      res.json({ success: true });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to set current session' });
    }
  },

  // NEW: Push test attempt scores to student results (CA or Exam) – uses service
  pushTestAttemptsToResults: async (req: Request, res: Response) => {
    try {
      const data = pushTestAttemptsSchema.parse(req.body);
      const result = await academicService.pushTestAttemptsToResults(data);
      res.json({ message: `Successfully pushed ${result.count} results to ${data.resultType}` });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error('Push test attempts error:', err);
      res.status(500).json({ error: err.message || 'Failed to push results' });
    }
  },
};