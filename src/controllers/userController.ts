import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { createUserSchema, updateUserSchema, updateStatusSchema } from '../validations/userValidation';
import { getStringParam } from '../utils/paramUtils';
import { idGeneratorService } from '../services/idGeneratorService';

export const userController = {
  // Preview the next auto-generated ID for a role (does NOT consume it)
  getNextId: async (req: Request, res: Response) => {
    try {
      const role = String(req.query.role || '');
      if (!role) return res.status(400).json({ error: 'role is required' });
      res.json(await idGeneratorService.previewNextId(role));
    } catch (err: any) {
      console.error('Preview next ID error:', err);
      res.status(500).json({ error: 'Failed to preview next ID' });
    }
  },

  getAllUsers: async (req: Request, res: Response) => {
    try {
      const users = await userService.getAllUsers();
      res.json(users);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  getRecentUsers: async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 5;
    try {
      const users = await userService.getRecentUsers(limit);
      res.json(users);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch recent users' });
    }
  },

  getUserById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const user = await userService.getUserById(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  },

  createUser: async (req: Request, res: Response) => {
    try {
      const data = createUserSchema.parse(req.body);
      const user = await userService.createUser(data);
      res.status(201).json(user);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.code === 'P2002') return res.status(409).json({ error: 'Email already exists' });
      if (err.message && err.message.includes('already in use')) {
        return res.status(409).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create user' });
    }
  },

  updateUser: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateUserSchema.parse(req.body);
      const updated = await userService.updateUser(id, data);
      res.json(updated);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.code === 'P2002') return res.status(409).json({ error: 'Email already exists' });
      if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to update user' });
    }
  },

  deleteUser: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {      await userService.deleteUser(id);
      res.json({ message: 'User deleted' });
    } catch (err: any) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  },

  bulkDelete: async (req: Request, res: Response) => {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
      return res.status(400).json({ error: 'ids must be a non-empty array of user ids' });
    }
    // Never allow an admin to bulk-delete their own account
    const currentUserId = (req as any).user?.id;
    const targetIds = currentUserId ? ids.filter((i: string) => i !== currentUserId) : ids;
    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    try {
      const result = await userService.deleteMany(targetIds);
      res.json({ message: `Deleted ${result.deleted} user(s)`, ...result });
    } catch (err) {
      console.error('Bulk delete users error:', err);
      res.status(500).json({ error: 'Failed to delete users' });
    }
  },

  updateStatus: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const { isActive } = updateStatusSchema.parse(req.body);
      const updated = await userService.updateStatus(id, isActive);
      res.json(updated);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  },
};