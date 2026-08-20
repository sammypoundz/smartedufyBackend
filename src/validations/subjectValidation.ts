import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});