import { Request, Response } from 'express';
import { staffService } from '../services/staffService';
import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { Role } from '@prisma/client';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const SALT_ROUNDS = 10;

const STAFF_ROLES: Role[] = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
const roleMap: Record<string, Role> = {
  Principal: 'PRINCIPAL',
  Teacher: 'TEACHER',
  Accountant: 'ACCOUNTANT',
  Admin: 'ADMIN',
  Librarian: 'LIBRARIAN',
  Bursar: 'BURSAR',
};

// Zod schema for creating/updating staff
const createStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string(),
  teacherType: z.string().optional(),
  assignedClass: z.string().optional(),
  assignedSubjects: z.any().optional(), // can be array or JSON string
});

// Helper to safely parse assignedSubjects
const parseAssignedSubjects = (subjects: any): { subject: string; class: string }[] => {
  if (!subjects) return [];
  if (Array.isArray(subjects)) return subjects;
  if (typeof subjects === 'string') {
    try {
      const parsed = JSON.parse(subjects);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const staffController = {
  // GET all staff
  getAll: async (req: Request, res: Response) => {
    try {
      const staff = await staffService.getAllStaff();
      res.json(staff);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch staff' });
    }
  },

  // GET single staff
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const staff = await staffService.getStaffById(id);
      if (!staff) return res.status(404).json({ error: 'Staff not found' });
      res.json(staff);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch staff' });
    }
  },

  // CREATE staff
  create: async (req: Request, res: Response) => {
    try {
      // Validate with Zod
      const validated = createStaffSchema.parse(req.body);
      const { name, email, role, teacherType, assignedClass, assignedSubjects } = validated;

      const enumRole = roleMap[role];
      if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
        return res.status(400).json({ error: 'Invalid staff role' });
      }

      // Check if email exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(400).json({ error: 'Email already in use' });

      const rawPassword = 'password123'; // In production, generate random
      const hashedPassword = await bcrypt.hash(rawPassword, SALT_ROUNDS);

      const subjectsArray = parseAssignedSubjects(assignedSubjects);

      const staff = await staffService.createStaff({
        name,
        email,
        role: enumRole,
        hashedPassword,
        teacherType,
        assignedClass,
        assignedSubjects: subjectsArray,
      });

      res.status(201).json(staff);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create staff' });
    }
  },

  // UPDATE staff
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    try {
      // Use Zod for validation (optional fields)
      const validated = createStaffSchema.partial().parse(req.body);
      const { name, email, role, teacherType, assignedClass, assignedSubjects } = validated;

      let enumRole: Role | undefined;
      if (role) {
        enumRole = roleMap[role];
        if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
          return res.status(400).json({ error: 'Invalid staff role' });
        }
      }

      const subjectsArray = parseAssignedSubjects(assignedSubjects);

      const staff = await staffService.updateStaff(id, {
        name,
        email,
        role: enumRole,
        teacherType,
        assignedClass,
        assignedSubjects: subjectsArray,
      });

      if (!staff) return res.status(404).json({ error: 'Staff not found' });
      res.json(staff);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      if (err.message === 'Staff not found') {
        return res.status(404).json({ error: 'Staff not found' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to update staff' });
    }
  },

  // DELETE staff
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const result = await staffService.deleteStaff(id);
      res.json(result);
    } catch (err: any) {
      if (err.message === 'Staff not found') {
        return res.status(404).json({ error: 'Staff not found' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to delete staff' });
    }
  },

  // BULK UPLOAD
  bulkUpload: async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      // Process each row through service
      const results = await staffService.bulkCreateStaff(rows);

      res.json({
        message: `Processed ${rows.length} rows. Created ${results.created.length}, errors ${results.errors.length}`,
        created: results.created,
        errors: results.errors,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Bulk upload failed' });
    }
  },

  // GENERATE REGISTRATION LINK
  generateLink: async (req: Request, res: Response) => {
    const token = uuidv4();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/register?token=${token}`;
    res.json({ link });
  },
};