import { Request, Response } from 'express';
import { studentService } from '../services/studentService';
import { assignParentSchema } from '../validations/studentValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';
import prisma from '../config/db';

// --- Schemas ---
const createStudentSchema = z.object({
  name: z.string().min(1),
  gender: z.string().optional(),
  admissionNumber: z.string().optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
});

// ✅ parentId accepts null (for unassigning)
const updateStudentSchema = z.object({
  name: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  admissionNumber: z.string().optional(),
  classId: z.string().optional(),
  armId: z.string().optional(),
  parentId: z.string().nullable().optional(),
  newParent: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
  }).optional(),
  guardianRelationship: z.string().optional(),
  isActive: z.boolean().optional(),
}).refine(data => !(data.parentId && data.newParent), {
  message: "Cannot provide both parentId and newParent",
});

const updateSubjectsSchema = z.object({
  subjectIds: z.array(z.string()),
});

export const studentController = {
  // ---------- Public validation endpoint ----------
  validateByAdmission: async (req: Request, res: Response) => {
    const { admissionNumber, armId } = req.query;
    if (!admissionNumber || !armId) {
      return res.status(400).json({ error: 'admissionNumber and armId are required' });
    }
    try {
      const student = await prisma.student.findFirst({
        where: {
          admissionNumber: String(admissionNumber),
          armId: String(armId),
        },
      });
      res.json({ exists: !!student });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Validation failed' });
    }
  },

  // ---------- Get authenticated student's own profile ----------
  getMe: async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const student = await prisma.student.findUnique({
        where: { userId },
        include: {
          arm: { include: { class: true } },
          user: { select: { email: true, role: true } },
        },
      });
      if (!student) return res.status(404).json({ error: 'Student profile not found' });
      res.json(student);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  },

  // ---------- Existing endpoints ----------
  getAll: async (req: Request, res: Response) => {
    try {
      const armId = req.query.armId as string | undefined;
      const students = await studentService.getAll(armId);
      res.json(students);
    } catch (err: any) {
      console.error('Get all students error:', err);
      res.status(500).json({ error: 'Failed to fetch students' });
    }
  },

  getByArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const students = await studentService.getByArmId(armId);
      res.json(students);
    } catch (err: any) {
      console.error('Get students by arm error:', err);
      res.status(500).json({ error: 'Failed to fetch students for arm' });
    }
  },

  getByClass: async (req: Request, res: Response) => {
    const classId = getStringParam(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });
    try {
      const students = await studentService.getByClassId(classId);
      res.json(students);
    } catch (err: any) {
      console.error('Get students by class error:', err);
      res.status(500).json({ error: 'Failed to fetch students for class' });
    }
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const student = await studentService.getById(id);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const userRole = (req as any).user?.role;
      const userId = (req as any).user?.id;
      if (userRole === 'STUDENT') {
        const requestingStudent = await prisma.student.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!requestingStudent || requestingStudent.id !== id) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      res.json(student);
    } catch (err: any) {
      console.error('Get student by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const data = createStudentSchema.parse(req.body);
      const student = await studentService.create(data);
      res.status(201).json(student);
    } catch (err: any) {
      console.error('Create student error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to create student' });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateStudentSchema.parse(req.body);
      let dateOfBirth: string | undefined = data.dateOfBirth;
      if (dateOfBirth) {
        dateOfBirth = new Date(dateOfBirth).toISOString();
      }
      // Convert null parentId to undefined for service
      const parentId = data.parentId === null ? undefined : data.parentId;

      const updated = await studentService.update(id, {
        name: data.name,
        gender: data.gender,
        dateOfBirth: dateOfBirth,
        address: data.address,
        admissionNumber: data.admissionNumber,
        classId: data.classId,
        armId: data.armId,
        parentId: parentId,
        newParent: data.newParent,
        guardianRelationship: data.guardianRelationship,
        isActive: data.isActive,
      });
      if (!updated) return res.status(404).json({ error: 'Student not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update student error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to update student' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await studentService.delete(id);
      res.json({ message: 'Student deleted' });
    } catch (err: any) {
      console.error('Delete student error:', err);
      res.status(500).json({ error: 'Failed to delete student' });
    }
  },

  assignParent: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const { parentId } = assignParentSchema.parse(req.body);
      const updated = await studentService.assignParent(id, parentId);
      if (!updated) return res.status(404).json({ error: 'Student not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Assign parent error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to assign parent' });
    }
  },

  // ---------- NEW: Unassign parent (now uses service) ----------
  unassignParent: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });

    try {
      const updated = await studentService.unassignParent(id);
      res.json(updated);
    } catch (err: any) {
      console.error('Unassign parent error:', err);
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Student not found' });
      }
      res.status(500).json({ error: 'Failed to unassign parent' });
    }
  },

  // ---------- Subject management ----------
  getStudentSubjects: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const subjects = await studentService.getStudentSubjects(id);
      res.json(subjects);
    } catch (err: any) {
      console.error('Get student subjects error:', err);
      res.status(500).json({ error: 'Failed to fetch student subjects' });
    }
  },

  updateStudentSubjects: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const { subjectIds } = updateSubjectsSchema.parse(req.body);
      const updated = await studentService.updateStudentSubjects(id, subjectIds);
      res.json(updated);
    } catch (err: any) {
      console.error('Update student subjects error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to update student subjects' });
    }
  },

  // ---------- Parent management ----------
  getAllParents: async (req: Request, res: Response) => {
    try {
      const parents = await studentService.getAllParents();
      res.json(parents);
    } catch (err: any) {
      console.error('Get all parents error:', err);
      res.status(500).json({ error: 'Failed to fetch parents' });
    }
  },

  createParent: async (req: Request, res: Response) => {
    try {
      const parentData = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
      }).parse(req.body);
      const parent = await studentService.createParent(parentData);
      res.status(201).json(parent);
    } catch (err: any) {
      console.error('Create parent error:', err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to create parent' });
    }
  },

  // ---------- Attendance, Fees, Results ----------
  getStudentAttendance: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const records = await studentService.getStudentAttendance(id);
      res.json(records);
    } catch (err: any) {
      console.error('Get student attendance error:', err);
      res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
  },

  getStudentFees: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const fees = await studentService.getStudentFees(id);
      res.json(fees);
    } catch (err: any) {
      console.error('Get student fees error:', err);
      res.status(500).json({ error: 'Failed to fetch fee records' });
    }
  },

  getStudentResults: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const results = await studentService.getStudentResults(id);
      res.json(results);
    } catch (err: any) {
      console.error('Get student results error:', err);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  },
};