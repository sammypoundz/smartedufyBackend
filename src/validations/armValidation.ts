import { z } from 'zod';

export const createArmSchema = z.object({
  letter: z.string().min(1),
  alias: z.string().optional(),
  classId: z.string(),
  teacherId: z.string().optional(), // creation does not need null
});

export const updateArmSchema = z.object({
  alias: z.string().optional(),
  teacherId: z.string().nullable().optional(), // ✅ allows null to unassign a teacher
});