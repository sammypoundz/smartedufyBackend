import { z } from 'zod';

export const createLessonPlanSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  classId: z.string(),
  armId: z.string(),
  subjectId: z.string(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).default('DRAFT'),
});

export const updateLessonPlanSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
});