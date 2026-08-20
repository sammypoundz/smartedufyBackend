import { z } from 'zod';

export const createBudgetSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, 'MonthYear must be in YYYY-MM format'),
});

export const updateBudgetSchema = createBudgetSchema.partial();