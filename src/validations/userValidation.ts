import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']),
  isActive: z.boolean().default(true),
  roles: z.array(z.string()).default([]),
  allowedPages: z.array(z.string()).default([]),
  // Auto ID (default) or manual custom ID
  idMode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  customId: z.string().max(60).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']).optional(),
  isActive: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  allowedPages: z.array(z.string()).optional(),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});