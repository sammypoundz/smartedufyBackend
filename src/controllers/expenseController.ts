import { Request, Response } from 'express';
import { expenseService } from '../services/expenseService';
import { createExpenseSchema, updateExpenseSchema } from '../validations/expenseValidation';
import { getStringParam } from '../utils/paramUtils';

export const expenseController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const expenses = await expenseService.getAll();
      res.json(expenses);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const expense = await expenseService.getById(id);
      if (!expense) return res.status(404).json({ error: 'Expense not found' });
      res.json(expense);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch expense' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const data = createExpenseSchema.parse(req.body);
      const expense = await expenseService.create({
        ...data,
        date: new Date(data.date),
      });
      res.status(201).json(expense);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateExpenseSchema.parse(req.body);
      const updatePayload: any = { ...data };
      if (data.date) updatePayload.date = new Date(data.date);
      const updated = await expenseService.update(id, updatePayload);
      if (!updated) return res.status(404).json({ error: 'Expense not found' });
      res.json(updated);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await expenseService.delete(id);
      res.json({ message: 'Expense deleted' });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  },
};