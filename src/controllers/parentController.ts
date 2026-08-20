import { Request, Response } from 'express';
import { parentService } from '../services/parentService';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const createParentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email(),
});

const updateParentSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export const parentController = {
  // Get all parents (for dropdown)
  getAll: async (req: Request, res: Response) => {
    try {
      const parents = await parentService.getAll();
      res.json(parents);
    } catch (err: any) {
      console.error('Get all parents error:', err);
      res.status(500).json({ error: 'Failed to fetch parents' });
    }
  },

  // Get single parent by ID
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const parent = await parentService.getById(id);
      if (!parent) return res.status(404).json({ error: 'Parent not found' });
      res.json(parent);
    } catch (err: any) {
      console.error('Get parent by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch parent' });
    }
  },

  // Create a new parent (automatically creates a User with role PARENT)
  create: async (req: Request, res: Response) => {
    try {
      const data = createParentSchema.parse(req.body);
      const parent = await parentService.create(data);
      res.status(201).json(parent);
    } catch (err: any) {
      console.error('Create parent error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      // Handle duplicate email from user creation
      if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      res.status(500).json({ error: 'Failed to create parent' });
    }
  },

  // Update parent information (name, phone, email)
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateParentSchema.parse(req.body);
      const updated = await parentService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Parent not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update parent error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      res.status(500).json({ error: 'Failed to update parent' });
    }
  },

  // Delete a parent (does not delete the associated User by default – be careful)
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await parentService.delete(id);
      res.json({ message: 'Parent deleted' });
    } catch (err: any) {
      console.error('Delete parent error:', err);
      res.status(500).json({ error: 'Failed to delete parent' });
    }
  },
};