import { Request, Response } from 'express';
import { teacherService } from '../services/teacherService';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';
import db from '../config/db';

const createTeacherSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  userId: z.string().optional(),
});

const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(), // for suspend/activate
});

export const teacherController = {
  // Get all teachers
  getAll: async (req: Request, res: Response) => {
    try {
      const teachers = await teacherService.getAll();
      res.json(teachers);
    } catch (err: any) {
      console.error('Get all teachers error:', err);
      res.status(500).json({ error: 'Failed to fetch teachers' });
    }
  },

  /**
   * GET /api/teachers/me
   * Get the authenticated teacher's profile
   */
  getMe: async (req: Request, res: Response) => {
    try {
      // Use optional chaining to safely access req.user
      const userId = req.user?.id;
      console.log('🔍 getMe called with userId:', userId);
      console.log('🔍 Full user object:', JSON.stringify(req.user, null, 2));

      if (!userId) {
        console.log('❌ No userId found in request');
        return res.status(401).json({ error: 'Unauthorized - User ID not found' });
      }

      // First, check if the user exists in the User table
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          isActive: true,
          schoolId: true,
        }
      });

      if (!user) {
        console.log('❌ User not found:', userId);
        return res.status(404).json({
          error: 'User not found',
          message: 'The authenticated user does not exist in the system.'
        });
      }

      console.log('✅ User found:', user.email, 'Role:', user.role);

      // Check if the user has a teacher record
      const teacher = await db.teacher.findUnique({
        where: { userId: userId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
            }
          },
          arms: {
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          },
          subjectArms: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                }
              },
              arm: {
                select: {
                  id: true,
                  letter: true,
                  class: {
                    select: {
                      name: true,
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!teacher) {
        console.log('❌ Teacher record not found for user:', userId);
        console.log('ℹ️ The user exists but does not have a teacher profile.');
        console.log('ℹ️ User role:', user.role);

        // Return a helpful response instead of 404
        return res.status(404).json({
          error: 'Teacher profile not found',
          message: 'No teacher profile exists for this user. Please contact your administrator.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          // Suggest creating a teacher record
          suggestion: 'Create a teacher record for this user in the Teacher table.',
        });
      }

      console.log('✅ Teacher found:', teacher.name, 'ID:', teacher.id);
      console.log('✅ Arms count:', teacher.arms?.length || 0);
      console.log('✅ Subject arms count:', teacher.subjectArms?.length || 0);

      res.json(teacher);
    } catch (err: any) {
      console.error('❌ Get current teacher error:', err);
      console.error('❌ Error stack:', err.stack);
      res.status(500).json({
        error: 'Failed to fetch teacher profile',
        message: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
  },

  // Get a single teacher by ID
  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      let teacher = await teacherService.getById(id);
      // Fallback: the id may be a User id (e.g. navigating from User Management).
      // Resolve the teacher record via the user, then fetch it fully.
      if (!teacher) {
        const byUser = await teacherService.getByUserId(id);
        if (byUser) teacher = await teacherService.getById(byUser.id);
      }
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      res.json(teacher);
    } catch (err: any) {
      console.error('Get teacher by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch teacher' });
    }
  },

  // Create a new teacher (admin only)
  create: async (req: Request, res: Response) => {
    try {
      const data = createTeacherSchema.parse(req.body);
      const teacher = await teacherService.create(data);
      res.status(201).json(teacher);
    } catch (err: any) {
      console.error('Create teacher error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create teacher' });
    }
  },

  // Update an existing teacher (admin only)
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateTeacherSchema.parse(req.body);
      const updated = await teacherService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Teacher not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update teacher error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  },

  // Delete a teacher (admin only)
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await teacherService.delete(id);
      res.json({ message: 'Teacher deleted' });
    } catch (err: any) {
      console.error('Delete teacher error:', err);
      res.status(500).json({ error: 'Failed to delete teacher' });
    }
  },

  // Reset teacher password (admin only)
  resetPassword: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const newPassword = await teacherService.resetPassword(id);
      res.json({ password: newPassword });
    } catch (err: any) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * PATCH /api/teachers/me
   * Self-service profile completion for the logged-in teacher.
   * Lets a teacher fill in their own phone number (e.g. right after
   * self-registration) without needing admin rights.
   */
  updateMe: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const teacher = await db.teacher.findUnique({ where: { userId } });
      if (!teacher) return res.status(404).json({ error: 'Teacher profile not found' });

      const schema = z.object({
        phone: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        // Self-service profile-setup fields (e.g. right after registration):
        teacherType: z.enum(['SUBJECT_TEACHER', 'FORM_TEACHER', 'BOTH']).optional(),
        briefSubjects: z
          .object({
            subjects: z.array(z.string()).optional(),
            classes: z.array(z.string()).optional(),
            // Specific arms the teacher chose (form teacher) — arm ids.
            armIds: z.array(z.string()).optional(),
            // subject name -> arm ids it is offered to (subject teacher).
            subjectArms: z
              .array(
                z.object({ subject: z.string().min(1), armId: z.string().min(1) }),
              )
              .optional(),
          })
          .optional(),
      });
      const data = schema.parse(req.body);

      const updated = await db.teacher.update({
        where: { id: teacher.id },
        data: {
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.teacherType !== undefined ? { teacherType: data.teacherType } : {}),
          ...(data.briefSubjects !== undefined ? { briefSubjects: data.briefSubjects } : {}),
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          teacherType: true,
          briefSubjects: true,
        },
      });

      // Keep the auth user's display name in sync if the teacher changed it
      if (data.name !== undefined) {
        await db.user.update({ where: { id: userId }, data: { name: data.name } });
      }

      res.json({ teacher: updated });
    } catch (err: any) {
      console.error('Update teacher self-profile error:', err);
      res.status(400).json({ error: err.message || 'Failed to update profile' });
    }
  },
};