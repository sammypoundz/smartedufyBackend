import { z } from 'zod';

export const createClassSchema = z.object({
  name: z.string().min(1),
});

export const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
});