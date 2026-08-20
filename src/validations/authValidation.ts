import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']),
  name: z.string(),
  schoolId: z.string().min(1, 'School ID is required'), // Required for registration – user is assigned to a school
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  // ❌ No schoolId – the backend derives it from the user record
});