import { Request, Response } from 'express';
import { budgetService } from '../services/budgetService';
import { createBudgetSchema, updateBudgetSchema } from '../validations/budgetValidation';
import { getStringParam } from '../utils/paramUtils';

export const budgetController = {
  getAllBudgets: async (req: Request, res: Response) => {
    try {
      const budgets = await budgetService.getAllBudgets();
      res.json(budgets);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch budgets' });
    }
  },

  createBudget: async (req: Request, res: Response) => {
    try {
      const data = createBudgetSchema.parse(req.body);
      const budget = await budgetService.createBudget(data);
      res.status(201).json(budget);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.message?.includes('already exists')) {
        return res.status(409).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create budget' });
    }
  },

  updateBudget: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateBudgetSchema.parse(req.body);
      const updated = await budgetService.updateBudget(id, data);
      res.json(updated);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.message === 'Budget not found') return res.status(404).json({ error: err.message });
      if (err.message?.includes('already exists')) return res.status(409).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Failed to update budget' });
    }
  },

  deleteBudget: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await budgetService.deleteBudget(id);
      res.json({ message: 'Budget deleted' });
    } catch (err: any) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Budget not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to delete budget' });
    }
  },
};