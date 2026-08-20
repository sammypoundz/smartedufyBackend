import { z } from 'zod';

export const createPayrollSchema = z.object({
  staffId: z.string().min(1),
  amount: z.number().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  status: z.enum(['PAID', 'PENDING', 'OVERDUE']).default('PENDING'),
  notes: z.string().optional(),
});

export const updatePayrollSchema = createPayrollSchema.partial();