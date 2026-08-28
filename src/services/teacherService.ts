import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

export const teacherService = {
  /**
   * Get all teachers with their user email, assigned arms (with class), and subjects taught (with arm & class).
   */
  getAll: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.teacher.findMany({
      where: { schoolId: tenantId },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        arms: {
          where: { schoolId: tenantId },
          include: { class: true },
        },
        subjectArms: {
          where: { schoolId: tenantId },
          include: {
            subject: true,
            arm: {
              include: { class: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Get a single teacher by ID, including all relations.
   * @param id - Teacher ID
   */
  getById: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 teacherService.getById called with:', id);

    return prisma.teacher.findUnique({
      where: { id, schoolId: tenantId },
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
          where: { schoolId: tenantId },
          include: { 
            class: {
              select: {
                id: true,
                name: true,
              }
            }
          },
        },
        subjectArms: {
          where: { schoolId: tenantId },
          include: {
            subject: {
              select: {
                id: true,
                name: true,
              }
            },
            arm: {
              include: { 
                class: {
                  select: {
                    name: true,
                  }
                }
              },
            },
          },
        },
      },
    });
  },

  /**
   * Get a teacher by userId (for class service and auth).
   * @param userId - The user ID from the User table
   * @returns The teacher with basic info
   */
  getByUserId: async (userId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 teacherService.getByUserId called with userId:', userId);

    if (!userId) {
      console.log('❌ No userId provided to getByUserId');
      return null;
    }

    try {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          schoolId: true,
          isActive: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
            }
          }
        }
      });

      if (teacher) {
        console.log('✅ Teacher found:', teacher.name, 'Teacher ID:', teacher.id);
      } else {
        console.log('❌ No teacher found for userId:', userId);
      }

      return teacher;
    } catch (error) {
      console.error('❌ Error in getByUserId:', error);
      throw error;
    }
  },

  /**
   * Create a new teacher. Automatically creates a User account for them.
   * @param data - Teacher data (name, email, phone, optional userId)
   * @returns The created teacher with relations.
   */
  create: async (data: { name: string; email: string; phone?: string; userId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 Creating new teacher with data:', data);

    let userId = data.userId;
    if (!userId) {
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: 'TEACHER',
          isActive: true,
          schoolId: tenantId,
        },
      });
      userId = user.id;
      console.log('✅ Created new user for teacher:', userId);
    }

    const teacher = await prisma.teacher.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || '',
        userId,
        schoolId: tenantId,
      },
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
          where: { schoolId: tenantId },
          include: { class: true },
        },
        subjectArms: {
          where: { schoolId: tenantId },
          include: { subject: true, arm: { include: { class: true } } },
        },
      },
    });

    console.log('✅ Teacher created:', teacher.name);
    return teacher;
  },

  /**
   * Update an existing teacher.
   * Also syncs changes to the associated User record (name, email, isActive).
   * @param id - Teacher ID
   * @param data - Partial data (name, email, phone, isActive)
   * @returns The updated teacher with relations.
   */
  update: async (id: string, data: { name?: string; email?: string; phone?: string; isActive?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 Updating teacher:', id, data);

    const teacher = await prisma.teacher.findUnique({
      where: { id, schoolId: tenantId },
      include: { user: true },
    });
    if (!teacher) {
      console.log('❌ Teacher not found for update:', id);
      throw new Error('Teacher not found');
    }

    const updatedTeacher = await prisma.teacher.update({
      where: { id, schoolId: tenantId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        isActive: data.isActive,
      },
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
          where: { schoolId: tenantId },
          include: { class: true },
        },
        subjectArms: {
          where: { schoolId: tenantId },
          include: { subject: true, arm: { include: { class: true } } },
        },
      },
    });

    // Sync changes to the associated User record
    if (data.name || data.email || data.isActive !== undefined) {
      await prisma.user.update({
        where: { id: teacher.userId, schoolId: tenantId },
        data: {
          name: data.name,
          email: data.email,
          isActive: data.isActive,
        },
      });
      console.log('✅ User record synced for teacher:', teacher.userId);
    }

    console.log('✅ Teacher updated:', updatedTeacher.name);
    return updatedTeacher;
  },

  /**
   * Delete a teacher.
   * @param id - Teacher ID
   * @returns The deleted teacher.
   */
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 Deleting teacher:', id);

    return prisma.teacher.delete({
      where: { id, schoolId: tenantId },
    });
  },

  /**
   * Reset a teacher's password.
   * Generates a random password, hashes it, updates the associated User, and returns the plain password.
   * @param id - Teacher ID
   * @returns The new plain‑text password.
   */
  resetPassword: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('🔍 Resetting password for teacher:', id);

    const teacher = await prisma.teacher.findUnique({
      where: { id, schoolId: tenantId },
      include: { user: true },
    });
    if (!teacher) {
      console.log('❌ Teacher not found for password reset:', id);
      throw new Error('Teacher not found');
    }
    
    const newPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: teacher.userId, schoolId: tenantId },
      data: { password: hashed },
    });
    
    console.log('✅ Password reset for teacher:', teacher.name);
    return newPassword;
  },
};