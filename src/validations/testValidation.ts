import { z } from 'zod';

export const createTestSchema = z.object({
  name: z.string().min(1),
  classId: z.string(),
  armId: z.string(),
  subjects: z.array(z.string()), // ✅ NEW: required array of subject IDs
  questionCount: z.number().min(1).max(1000),
  duration: z.number().min(1).max(300),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export const updateTestSchema = z.object({
  name: z.string().min(1).optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
  subjects: z.array(z.string()).optional(), // ✅ NEW: optional array
  questionCount: z.number().min(1).max(1000).optional(),
  duration: z.number().min(1).max(300).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});