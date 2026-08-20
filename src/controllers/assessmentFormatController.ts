import { Request, Response } from 'express';
import { assessmentFormatService } from '../services/assessmentFormatService';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const createFormatSchema = z.object({
  name: z.string().min(1),
  ca: z.number().int().min(0).max(100),
  exam: z.number().int().min(0).max(100),
});

const updateFormatSchema = z.object({
  name: z.string().min(1).optional(),
  ca: z.number().int().min(0).max(100).optional(),
  exam: z.number().int().min(0).max(100).optional(),
});

export const assessmentFormatController = {
  // GET /assessment-formats
  getAll: async (req: Request, res: Response) => {
    try {
      const formats = await assessmentFormatService.getAll();
      res.json(formats);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch assessment formats' });
    }
  },

  // GET /assessment-formats/:id
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const format = await assessmentFormatService.getById(id);
      if (!format) return res.status(404).json({ error: 'Format not found' });
      res.json(format);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch format' });
    }
  },

  // POST /assessment-formats
  create: async (req: Request, res: Response) => {
    try {
      const data = createFormatSchema.parse(req.body);
      const format = await assessmentFormatService.create(data);
      res.status(201).json(format);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message || 'Failed to create format' });
    }
  },

  // PUT /assessment-formats/:id
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateFormatSchema.parse(req.body);
      const updated = await assessmentFormatService.update(id, data);
      res.json(updated);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      if (err.message === 'Format not found') {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message || 'Failed to update format' });
    }
  },

  // DELETE /assessment-formats/:id
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await assessmentFormatService.delete(id);
      res.json({ message: 'Assessment format deleted successfully' });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete format' });
    }
  },
};