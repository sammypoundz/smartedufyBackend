import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { inventoryService } from '../services/inventoryService';
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  inventoryQuerySchema,
} from '../validations/inventoryValidation';

export const inventoryController = {
  // Get all items (paginated + filters)
  getAll: async (req: AuthRequest, res: Response) => {
    try {
      const query = inventoryQuerySchema.parse(req.query);
      const result = await inventoryService.getAll(query);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      console.error('[inventory.getAll]', err);
      res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
  },

  // Get one item
  getById: async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const item = await inventoryService.getById(id);
      res.json(item);
    } catch (err: any) {
      if (err.message === 'Item not found') {
        return res.status(404).json({ error: err.message });
      }
      console.error('[inventory.getById]', err);
      res.status(500).json({ error: 'Failed to fetch item' });
    }
  },

  // Create
  create: async (req: AuthRequest, res: Response) => {
    try {
      const data = createInventoryItemSchema.parse(req.body);
      const item = await inventoryService.create(data);
      res.status(201).json(item);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      console.error('[inventory.create]', err);
      res.status(500).json({ error: 'Failed to create item' });
    }
  },

  // Update
  update: async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const data = updateInventoryItemSchema.parse(req.body);
      const item = await inventoryService.update(id, data);
      res.json(item);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      if (err.message === 'Item not found') {
        return res.status(404).json({ error: err.message });
      }
      console.error('[inventory.update]', err);
      res.status(500).json({ error: 'Failed to update item' });
    }
  },

  // Delete
  delete: async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      await inventoryService.delete(id);
      res.status(204).send();
    } catch (err: any) {
      if (err.message === 'Item not found') {
        return res.status(404).json({ error: err.message });
      }
      console.error('[inventory.delete]', err);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  },

  // Stats
  getStats: async (req: AuthRequest, res: Response) => {
    try {
      const stats = await inventoryService.getStats();
      res.json(stats);
    } catch (err: any) {
      console.error('[inventory.getStats]', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  },
};