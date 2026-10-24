import { Request, Response } from 'express';
import { staffService } from '../services/staffService';
import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { Role } from '@prisma/client';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';
import crypto from 'crypto';

type StaffRequest = Request & { schoolId?: string };

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

// Resolve a role label/enum (e.g. "Teacher", "TEACHER", or a custom role's
// label like "Examiner") to either a Role enum value or the raw name of a
// custom role defined on the Roles & Privileges page. Returns null if the
// role does not exist in this school.
const resolveRole = async (schoolId: string | undefined, name: string): Promise<string | null> => {
  if (!name) return null;
  // Direct enum hit (e.g. "TEACHER" or a mapped display label).
  const enumRole = roleMap[name] || (Role as any)[name];
  if (enumRole) return enumRole;
  if (!schoolId) return null;
  // Custom role: match by name or label on the school's RoleDef table.
  const custom = await prisma.roleDef.findFirst({
    where: { schoolId, OR: [{ name }, { label: name }] },
  });
  return custom ? custom.name : null;
};

// Zod schema for creating/updating staff
const createStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string(),
  // Secondary roles (dual-role support), e.g. ['TEACHER'] for an
  // accountant who also teaches.
  extraRoles: z.array(z.string()).optional(),
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
  create: async (req: StaffRequest, res: Response) => {
    try {
      // Validate with Zod
      const validated = createStaffSchema.parse(req.body);
      const { name, email, role, extraRoles, teacherType, assignedClass, assignedSubjects } = validated;

      // Primary role: system enum OR a custom role defined for this school.
      // Custom roles can't go in the Role enum column, so they are stored as
      // the primary entry of the User.roles array (see below).
      const resolvedRole = await resolveRole(req.schoolId, role);
      if (!resolvedRole) {
        return res.status(400).json({ error: 'Invalid staff role' });
      }
      // Secondary roles can be system roles and/or custom roles.
      const resolvedExtras = (
        await Promise.all((extraRoles || []).map((r: string) => resolveRole(req.schoolId, r)))
      ).filter((r): r is string => !!r && r !== resolvedRole);

      // The Role enum column only holds system roles; custom roles fall back
      // to their RoleDef name and become the primary entry in User.roles.
      const isEnumRole = STAFF_ROLES.includes(resolvedRole as Role) || ['PARENT', 'STUDENT', 'VICE_PRINCIPAL'].includes(resolvedRole);
      const enumRole = isEnumRole ? (resolvedRole as Role) : 'TEACHER';
      const primaryForRoles = resolvedRole;
      const extraEnumRoles = Array.from(new Set([primaryForRoles, ...resolvedExtras]))
        .filter((r) => r !== enumRole);
      // When the primary role is a custom role, TEACHER becomes the enum
      // placeholder — make sure TEACHER is not accidentally left in extras
      // unless it was actually selected.
      const finalExtras = enumRole === 'TEACHER' && !isEnumRole
        ? extraEnumRoles.filter((r) => r !== 'TEACHER')
        : extraEnumRoles;

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
        roles: finalExtras.length ? Array.from(new Set([primaryForRoles, ...finalExtras])) : undefined,
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
  update: async (req: StaffRequest, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    try {
      // Use Zod for validation (optional fields)
      const validated = createStaffSchema.partial().parse(req.body);
      const { name, email, role, extraRoles, teacherType, assignedClass, assignedSubjects } = validated;

      let resolvedRole: string | undefined;
      if (role) {
        resolvedRole = (await resolveRole(req.schoolId, role)) ?? undefined;
        if (!resolvedRole) {
          return res.status(400).json({ error: 'Invalid staff role' });
        }
      }
      const resolvedExtras = extraRoles !== undefined
        ? (await Promise.all((extraRoles as string[]).map((r) => resolveRole(req.schoolId, r))))
            .filter((r): r is string => !!r)
        : undefined;

      const isEnumRole = resolvedRole !== undefined
        && (STAFF_ROLES.includes(resolvedRole as Role) || ['PARENT', 'STUDENT', 'VICE_PRINCIPAL'].includes(resolvedRole));
      let enumRole: Role | undefined;
      if (resolvedRole !== undefined) {
        enumRole = isEnumRole ? (resolvedRole as Role) : 'TEACHER';
      }
      let extraEnumRoles: string[] | undefined;
      if (resolvedExtras !== undefined) {
        const primary = resolvedRole ?? enumRole;
        extraEnumRoles = Array.from(
          new Set([primary, ...resolvedExtras].filter((r): r is string => !!r)),
        ).filter((r) => r !== enumRole);
        // Drop the TEACHER placeholder when the primary role is custom.
        if (resolvedRole !== undefined && !isEnumRole) {
          extraEnumRoles = extraEnumRoles.filter((r) => r !== 'TEACHER');
        }
      }

      const subjectsArray = parseAssignedSubjects(assignedSubjects);

      const staff = await staffService.updateStaff(id, {
        name,
        email,
        role: enumRole,
        roles: extraEnumRoles !== undefined && resolvedRole !== undefined
          ? Array.from(new Set([resolvedRole, ...extraEnumRoles]))
          : undefined,
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
    const token = crypto.randomUUID();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/register?token=${token}`;
    res.json({ link });
  },
};