import { z } from 'zod';

export const createSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});