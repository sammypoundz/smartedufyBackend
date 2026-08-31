import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

export const userService = {
  getAllUsers: async () => {
    // middleware adds schoolId to where automatically
    const users = await prisma.user.findMany({
      include: {
        student: true,
        teacher: true,
        parent: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(user => {
      let name = null;
      if (user.role === 'STUDENT' && user.student) name = user.student.name;
      else if (user.role === 'TEACHER' && user.teacher) name = user.teacher.name;
      else if (user.role === 'PARENT' && user.parent) name = user.parent.name;
      else if (user.name) name = user.name;
      else name = user.email.split('@')[0];

      return {
        id: user.id,
        name,
        email: user.email,
        role: user.role,
        roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
        isActive: user.isActive,
        allowedPages: user.allowedPages || [],
        createdAt: user.createdAt,
      };
    });
  },

  getRecentUsers: async (limit: number) => {
    // middleware adds schoolId
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        student: { select: { name: true } },
        teacher: { select: { name: true } },
        parent: { select: { name: true } },
      },
    });

    return users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      name: user.student?.name || user.teacher?.name || user.parent?.name || user.name || user.email.split('@')[0],
    }));
  },

  getUserById: async (id: string) => {
    // middleware adds schoolId
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        student: true,
        teacher: true,
        parent: true,
      },
    });
    if (!user) return null;

    let name = null;
    if (user.role === 'STUDENT' && user.student) name = user.student.name;
    else if (user.role === 'TEACHER' && user.teacher) name = user.teacher.name;
    else if (user.role === 'PARENT' && user.parent) name = user.parent.name;
    else if (user.name) name = user.name;
    else name = user.email.split('@')[0];

    return {
      id: user.id,
      name,
      email: user.email,
      role: user.role,
      roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
      isActive: user.isActive,
      allowedPages: user.allowedPages || [],
      createdAt: user.createdAt,
    };
  },

  createUser: async (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    isActive: boolean;
    roles?: string[];
    allowedPages?: string[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create the user AND its role-specific profile row atomically so all
    // necessary tables are populated (data integrity).
    const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: data.role as any,
          roles: data.roles?.length ? data.roles : [data.role].filter(Boolean),
          isActive: data.isActive,
          allowedPages: data.allowedPages || [],
          schoolId: tenantId, // 👈 required
        },
      });

      if (created.role === 'TEACHER') {
        await tx.teacher.create({
          data: {
            name: data.name,
            email: data.email,
            phone: '',
            userId: created.id,
            schoolId: tenantId,
          },
        });
      } else if (created.role === 'PARENT') {
        await tx.parent.create({
          data: {
            name: data.name,
            email: data.email,
            phone: '',
            userId: created.id,
            schoolId: tenantId,
          },
        });
      } else if (created.role === 'STUDENT') {
        await tx.student.create({
          data: {
            name: data.name,
            gender: '',
            userId: created.id,
            schoolId: tenantId,
          },
        });
      }

      return tx.user.findUnique({
        where: { id: created.id },
        include: {
          student: true,
          teacher: true,
          parent: true,
        },
      });
    });

    if (!user) throw new Error('User creation failed');

    let displayName = data.name;
    if (user.role === 'STUDENT' && user.student) displayName = user.student.name;
    else if (user.role === 'TEACHER' && user.teacher) displayName = user.teacher.name;
    else if (user.role === 'PARENT' && user.parent) displayName = user.parent.name;

    return {
      id: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
      roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
      isActive: user.isActive,
      allowedPages: user.allowedPages || [],
      createdAt: user.createdAt,
    };
  },

  updateUser: async (id: string, data: Partial<{
    name: string;
    email: string;
    password: string;
    role: string;
    isActive: boolean;
    roles: string[];
    allowedPages: string[];
  }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updateData: any = { ...data };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const user = await prisma.user.update({
      where: { id, schoolId: tenantId },
      data: updateData,
      include: {
        student: true,
        teacher: true,
        parent: true,
      },
    });

    let displayName = user.name;
    if (user.role === 'STUDENT' && user.student) displayName = user.student.name;
    else if (user.role === 'TEACHER' && user.teacher) displayName = user.teacher.name;
    else if (user.role === 'PARENT' && user.parent) displayName = user.parent.name;

    return {
      id: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
      roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
      isActive: user.isActive,
      allowedPages: user.allowedPages || [],
      createdAt: user.createdAt,
    };
  },

  deleteUser: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Delete dependent profile rows first so all related tables stay
    // consistent (Payroll cascades automatically).
    return prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({ where: { userId: id } });
      if (teacher) {
        // Detach teacher from arms / subject-arms before removal
        await tx.arm.updateMany({
          where: { teacherId: teacher.id, schoolId: tenantId },
          data: { teacherId: null },
        });
        await tx.subjectArm.updateMany({
          where: { teacherId: teacher.id, schoolId: tenantId },
          data: { teacherId: null },
        });
        await tx.subjectTeacher.deleteMany({
          where: { teacherId: teacher.id, schoolId: tenantId },
        });
        await tx.teacher.delete({ where: { id: teacher.id, schoolId: tenantId } });
      }

      const parent = await tx.parent.findUnique({ where: { userId: id } });
      if (parent) {
        // Detach children before removing the parent record
        await tx.student.updateMany({
          where: { parentId: parent.id, schoolId: tenantId },
          data: { parentId: null },
        });
        await tx.parent.delete({ where: { id: parent.id, schoolId: tenantId } });
      }

      const student = await tx.student.findUnique({ where: { userId: id } });
      if (student) {
        await tx.studentSubject.deleteMany({
          where: { studentId: student.id, schoolId: tenantId },
        });
        await tx.student.delete({ where: { id: student.id, schoolId: tenantId } });
      }

      return tx.user.delete({
        where: { id, schoolId: tenantId },
      });
    });
  },

  updateStatus: async (id: string, isActive: boolean) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const user = await prisma.user.update({
      where: { id, schoolId: tenantId },
      data: { isActive },
      include: {
        student: true,
        teacher: true,
        parent: true,
      },
    });

    let displayName = user.name;
    if (user.role === 'STUDENT' && user.student) displayName = user.student.name;
    else if (user.role === 'TEACHER' && user.teacher) displayName = user.teacher.name;
    else if (user.role === 'PARENT' && user.parent) displayName = user.parent.name;

    return {
      id: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
      roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
      isActive: user.isActive,
      allowedPages: user.allowedPages || [],
      createdAt: user.createdAt,
    };
  },
};