import { z } from 'zod';

export const createQuestionSchema = z.object({
  testId: z.string(),
  subjectId: z.string().nullable().optional(),
  text: z.string().min(1),
  options: z.array(z.string()).min(2).max(6),
  correctOption: z.number().int().min(0),
  marks: z.number().int().min(1).default(1),
  attachmentType: z.enum(['image', 'video', 'audio']).nullable().optional(),
  attachmentUrl: z.string().nullable().optional(),
});

export const updateQuestionSchema = z.object({
  subjectId: z.string().nullable().optional(),
  text: z.string().min(1).optional(),
  options: z.array(z.string()).min(2).max(6).optional(),
  correctOption: z.number().int().min(0).optional(),
  marks: z.number().int().min(1).optional(),
  attachmentType: z.enum(['image', 'video', 'audio']).nullable().optional(),
  attachmentUrl: z.string().nullable().optional(),
});