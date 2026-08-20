import { z } from 'zod';

// ==================== Existing ====================
export const assignParentSchema = z.object({
  parentId: z.string(),
});

export const createStudentSchema = z.object({
  name: z.string().min(1),
  gender: z.string().optional(),
  admissionNumber: z.string().optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
});

// Extended update schema: now accepts personal, academic, and parent fields
export const updateStudentSchema = z.object({
  // Personal fields
  name: z.string().min(1).optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(), // ISO date string
  address: z.string().optional(),
  admissionNumber: z.string().optional(),
  // Academic fields
  classId: z.string().optional(),
  armId: z.string().optional(),
  // Parent fields (mutually exclusive)
  parentId: z.string().optional(),
  newParent: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }).optional(),
}).refine(data => !(data.parentId && data.newParent), {
  message: "Cannot provide both parentId and newParent",
});

// ==================== New for StudentBio ====================
export const createParentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export const updateStudentSubjectsSchema = z.object({
  subjectIds: z.array(z.string()),
});