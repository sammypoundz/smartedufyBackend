import { Request, Response } from 'express';
import { teacherService } from '../services/teacherService';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const createTeacherSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  userId: z.string().optional(),
});

const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(), // ✅ NEW: for suspend/activate
});

export const teacherController = {
  // Get all teachers
  getAll: async (req: Request, res: Response) => {
    try {
      const teachers = await teacherService.getAll();
      res.json(teachers);
    } catch (err: any) {
      console.error('Get all teachers error:', err);
      res.status(500).json({ error: 'Failed to fetch teachers' });
    }
  },

  // Get a single teacher by ID
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const teacher = await teacherService.getById(id);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      res.json(teacher);
    } catch (err: any) {
      console.error('Get teacher by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch teacher' });
    }
  },

  // Create a new teacher (admin only)
  create: async (req: Request, res: Response) => {
    try {
      const data = createTeacherSchema.parse(req.body);
      const teacher = await teacherService.create(data);
      res.status(201).json(teacher);
    } catch (err: any) {
      console.error('Create teacher error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create teacher' });
    }
  },

  // Update an existing teacher (admin only)
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateTeacherSchema.parse(req.body);
      const updated = await teacherService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Teacher not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update teacher error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  },

  // Delete a teacher (admin only)
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await teacherService.delete(id);
      res.json({ message: 'Teacher deleted' });
    } catch (err: any) {
      console.error('Delete teacher error:', err);
      res.status(500).json({ error: 'Failed to delete teacher' });
    }
  },

  // Reset teacher password (admin only)
  resetPassword: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const newPassword = await teacherService.resetPassword(id);
      res.json({ password: newPassword });
    } catch (err: any) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: err.message });
    }
  },
};