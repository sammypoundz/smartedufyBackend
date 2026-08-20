import { Request, Response } from 'express';
import { testService } from '../services/testService';
import { createTestSchema, updateTestSchema } from '../validations/testValidation';
import { getStringParam } from '../utils/paramUtils';

export const testController = {
  getAll: async (req: Request, res: Response) => {
    try {
      // Extract query parameters for filtering
      const armId = req.query.armId as string | undefined;
      const status = req.query.status as string | undefined;

      // Call service with optional filters
      const tests = await testService.getAll({ armId, status });
      res.json(tests);
    } catch (err: any) {
      console.error('Get tests error:', err);
      res.status(500).json({ error: 'Failed to fetch tests' });
    }
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const test = await testService.getById(id);
      if (!test) return res.status(404).json({ error: 'Test not found' });
      res.json(test);
    } catch (err: any) {
      console.error('Get test by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch test' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const data = createTestSchema.parse(req.body);
      const newTest = await testService.create(data);
      res.status(201).json(newTest);
    } catch (err: any) {
      console.error('Create test error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to create test' });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateTestSchema.parse(req.body);
      const updated = await testService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Test not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update test error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to update test' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const existingTest = await testService.getById(id);
      if (!existingTest) {
        return res.status(404).json({ error: 'Test not found' });
      }
      await testService.delete(id);
      res.json({ message: 'Test deleted successfully' });
    } catch (err: any) {
      console.error('Delete test error:', err);
      res.status(500).json({ error: 'Failed to delete test' });
    }
  },
};