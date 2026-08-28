import { Request, Response } from 'express';
import { classService } from '../services/classService';
import { armService } from '../services/armService';
import { createClassSchema, updateClassSchema } from '../validations/classValidation';
import { getStringParam } from '../utils/paramUtils';
import prisma from '../config/db';

export const classController = {
  /**
   * GET /api/classes
   * Returns all classes with arms, each arm including:
   * - teacher (id, name, email, phone)
   * - student count (_count.students)
   */
  getAll: async (req: Request, res: Response) => {
    try {
      const classes = await prisma.class.findMany({
        include: {
          arms: {
            include: {
              teacher: {
                select: { id: true, name: true, email: true, phone: true },
              },
              _count: {
                select: { students: true }, // 👈 student counter
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      res.json(classes);
    } catch (err: any) {
      console.error('Get all classes error:', err);
      res.status(500).json({ error: 'Failed to fetch classes' });
    }
  },

  /**
   * GET /api/classes/teacher/classes
   * Returns only the classes (with their arms) assigned to the authenticated
   * teacher — arms where they are class teacher and arms where they teach
   * at least one subject. Must be registered BEFORE /:id in the router.
   */
  getMyClasses: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const teacher = await prisma.teacher.findUnique({
        where: { userId },
        include: {
          arms: {
            include: {
              class: { select: { id: true, name: true } },
              _count: { select: { students: true } },
            },
          },
          subjectArms: {
            include: {
              arm: {
                include: {
                  class: { select: { id: true, name: true } },
                  _count: { select: { students: true } },
                },
              },
            },
          },
        },
      });

      if (!teacher) return res.json([]);

      // Collect unique arms: class-teacher arms + arms where they teach subjects
      const armMap = new Map<string, any>();
      for (const arm of teacher.arms) armMap.set(arm.id, arm);
      for (const sa of teacher.subjectArms) {
        if (sa.arm) armMap.set(sa.arm.id, sa.arm);
      }

      // Group arms by class
      const classMap = new Map<string, { id: string; name: string; arms: any[] }>();
      for (const arm of armMap.values()) {
        if (!arm.class) continue;
        if (!classMap.has(arm.class.id)) {
          classMap.set(arm.class.id, {
            id: arm.class.id,
            name: arm.class.name,
            arms: [],
          });
        }
        classMap.get(arm.class.id)!.arms.push({
          id: arm.id,
          letter: arm.letter,
          alias: arm.alias,
          teacherId: arm.teacherId,
          _count: arm._count || { students: 0 },
        });
      }

      res.json(Array.from(classMap.values()));
    } catch (err: any) {
      console.error('Get my classes error:', err);
      res.status(500).json({ error: 'Failed to fetch your classes' });
    }
  },

  /**
   * GET /api/classes/:id
   * Returns a single class with arms, teacher details, and student count.
   */
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const cls = await prisma.class.findUnique({
        where: { id },
        include: {
          arms: {
            include: {
              teacher: {
                select: { id: true, name: true, email: true, phone: true },
              },
              _count: {
                select: { students: true },
              },
            },
          },
          // students: true, // removed – not needed for the class detail view
        },
      });
      if (!cls) return res.status(404).json({ error: 'Class not found' });
      res.json(cls);
    } catch (err: any) {
      console.error('Get class by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch class' });
    }
  },

  /**
   * GET /api/classes/:classId/arms
   * Returns all arms for a given class (uses armService, already correct).
   */
  getArmsByClassId: async (req: Request, res: Response) => {
    const classId = getStringParam(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });
    try {
      const arms = await armService.getByClassId(classId);
      res.json(arms);
    } catch (err: any) {
      console.error('Get arms by class ID error:', err);
      res.status(500).json({ error: 'Failed to fetch arms for class' });
    }
  },

  /**
   * POST /api/classes
   * Create a new class (admin only)
   */
  create: async (req: Request, res: Response) => {
    try {
      const { name } = createClassSchema.parse(req.body);
      const newClass = await classService.create(name);
      res.status(201).json(newClass);
    } catch (err: any) {
      console.error('Create class error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create class' });
    }
  },

  /**
   * PUT /api/classes/:id
   * Update a class name (admin only)
   */
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const { name } = updateClassSchema.parse(req.body);
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const updated = await classService.update(id, name);
      res.json(updated);
    } catch (err: any) {
      console.error('Update class error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update class' });
    }
  },

  /**
   * DELETE /api/classes/:id
   * Delete a class (admin only)
   */
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await classService.delete(id);
      res.json({ message: 'Class deleted' });
    } catch (err: any) {
      console.error('Delete class error:', err);
      res.status(500).json({ error: 'Failed to delete class' });
    }
  },
};