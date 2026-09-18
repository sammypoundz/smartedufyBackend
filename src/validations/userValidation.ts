import { z } from 'zod';

// Role names follow UPPERCASE_WITH_UNDERSCORES (system + custom RoleDefs).
const roleName = z
  .string()
  .regex(/^[A-Z0-9_]+$/, 'Use UPPERCASE_WITH_UNDERSCORES');

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: roleName,
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
  role: roleName.optional(),
  isActive: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  allowedPages: z.array(z.string()).optional(),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});