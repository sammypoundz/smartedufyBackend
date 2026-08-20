import prisma from '../config/db';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

// ---------- Helper: build staff response ----------
export const buildStaffResponse = async (user: any) => {
  let teacherData = null;
  if (user.role === 'TEACHER') {
    teacherData = await prisma.teacher.findUnique({
      where: { userId: user.id },
      include: {
        arms: { include: { class: true } },
        subjectArms: { include: { subject: true, arm: { include: { class: true } } } },
      },
    });
  }

  const staff: any = {
    id: user.id,
    name: user.name || '',
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };

  if (user.role === 'TEACHER' && teacherData) {
    const arms = teacherData.arms || [];
    const subjectArms = teacherData.subjectArms || [];
    staff.teacherType = arms.length > 0 ? 'class_teacher' : 
                       (subjectArms.length > 0 ? 'subject_teacher' : null);
    staff.assignedClass = arms[0]?.class?.name || null;
    staff.assignedSubjects = subjectArms.map((sa: any) => ({
      subject: sa.subject.name,
      class: sa.arm?.class?.name || '',
    }));
  } else {
    staff.teacherType = null;
    staff.assignedClass = null;
    staff.assignedSubjects = [];
  }

  return staff;
};

// Helper to safely parse assignedSubjects (for bulk upload)
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

// ---------- Service ----------
export const staffService = {
  // Get all staff (users with staff roles) – middleware adds schoolId
  getAllStaff: async () => {
    const STAFF_ROLES: Role[] = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
    const users = await prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(users.map(buildStaffResponse));
  },

  getStaffById: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const user = await prisma.user.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!user) return null;
    return buildStaffResponse(user);
  },

  createStaff: async (data: {
    name: string;
    email: string;
    role: Role;
    hashedPassword: string;
    teacherType?: string;
    assignedClass?: string;
    assignedSubjects?: { subject: string; class: string }[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const { name, email, role, hashedPassword, teacherType, assignedClass, assignedSubjects } = data;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive: true,
        schoolId: tenantId,
      },
    });

    if (role === 'TEACHER') {
      const teacher = await prisma.teacher.create({
        data: {
          name: name || '',
          email,
          userId: user.id,
          schoolId: tenantId,
        },
      });

      if (teacherType === 'class_teacher' && assignedClass) {
        const arm = await prisma.arm.findFirst({
          where: { class: { name: assignedClass }, schoolId: tenantId },
        });
        if (arm) {
          await prisma.arm.update({
            where: { id: arm.id, schoolId: tenantId },
            data: { teacherId: teacher.id },
          });
        }
      }

      if (teacherType === 'subject_teacher' && assignedSubjects?.length) {
        for (const subj of assignedSubjects) {
          const subject = await prisma.subject.findFirst({
            where: { name: subj.subject, schoolId: tenantId },
          });
          const arm = await prisma.arm.findFirst({
            where: { class: { name: subj.class }, schoolId: tenantId },
          });
          if (subject && arm) {
            await prisma.subjectArm.create({
              data: {
                subjectId: subject.id,
                armId: arm.id,
                teacherId: teacher.id,
                schoolId: tenantId,
              },
            });
          }
        }
      }
    }

    return buildStaffResponse(user);
  },

  updateStaff: async (id: string, data: {
    name?: string;
    email?: string;
    role?: Role;
    teacherType?: string;
    assignedClass?: string;
    assignedSubjects?: { subject: string; class: string }[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const { name, email, role, teacherType, assignedClass, assignedSubjects } = data;

    const user = await prisma.user.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!user) throw new Error('Staff not found');

    const userUpdateData: any = {};
    if (name !== undefined) userUpdateData.name = name;
    if (email !== undefined) userUpdateData.email = email;
    if (role !== undefined) userUpdateData.role = role;

    const updatedUser = await prisma.user.update({
      where: { id, schoolId: tenantId },
      data: userUpdateData,
    });

    // Handle teacher sync
    if (role === 'TEACHER') {
      let teacher = await prisma.teacher.findUnique({
        where: { userId: id, schoolId: tenantId },
      });
      if (!teacher) {
        teacher = await prisma.teacher.create({
          data: {
            name: (name !== undefined ? name : user.name) || '',
            email: (email !== undefined ? email : user.email) || '',
            userId: id,
            schoolId: tenantId,
          },
        });
      } else {
        const teacherUpdateData: any = {};
        if (name !== undefined) teacherUpdateData.name = name;
        if (email !== undefined) teacherUpdateData.email = email;
        if (Object.keys(teacherUpdateData).length > 0) {
          teacher = await prisma.teacher.update({
            where: { id: teacher.id, schoolId: tenantId },
            data: teacherUpdateData,
          });
        }
      }

      // Clear existing assignments (tenant-scoped)
      await prisma.arm.updateMany({
        where: { teacherId: teacher.id, schoolId: tenantId },
        data: { teacherId: null },
      });
      await prisma.subjectArm.deleteMany({
        where: { teacherId: teacher.id, schoolId: tenantId },
      });

      // Class teacher assignment
      if (teacherType === 'class_teacher' && assignedClass) {
        const arm = await prisma.arm.findFirst({
          where: { class: { name: assignedClass }, schoolId: tenantId },
        });
        if (arm) {
          await prisma.arm.update({
            where: { id: arm.id, schoolId: tenantId },
            data: { teacherId: teacher.id },
          });
        }
      }

      // Subject teacher assignments
      if (teacherType === 'subject_teacher' && assignedSubjects?.length) {
        for (const subj of assignedSubjects) {
          const subject = await prisma.subject.findFirst({
            where: { name: subj.subject, schoolId: tenantId },
          });
          const arm = await prisma.arm.findFirst({
            where: { class: { name: subj.class }, schoolId: tenantId },
          });
          if (subject && arm) {
            await prisma.subjectArm.create({
              data: {
                subjectId: subject.id,
                armId: arm.id,
                teacherId: teacher.id,
                schoolId: tenantId,
              },
            });
          }
        }
      }
    } else {
      // If role changed from TEACHER, delete teacher record (tenant-scoped)
      const teacher = await prisma.teacher.findUnique({
        where: { userId: id, schoolId: tenantId },
      });
      if (teacher) {
        await prisma.teacher.delete({
          where: { id: teacher.id, schoolId: tenantId },
        });
      }
    }

    return buildStaffResponse(updatedUser);
  },

  deleteStaff: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const user = await prisma.user.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!user) throw new Error('Staff not found');

    if (user.role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: id, schoolId: tenantId },
      });
      if (teacher) {
        await prisma.teacher.delete({
          where: { id: teacher.id, schoolId: tenantId },
        });
      }
    }

    await prisma.user.delete({
      where: { id, schoolId: tenantId },
    });
    return { message: 'Staff deleted successfully' };
  },

  bulkCreateStaff: async (rows: any[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const results: { created: any[]; errors: { row: any; error: string }[] } = {
      created: [],
      errors: [],
    };

    const STAFF_ROLES: Role[] = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
    const roleMap: Record<string, Role> = {
      Principal: 'PRINCIPAL',
      Teacher: 'TEACHER',
      Accountant: 'ACCOUNTANT',
      Admin: 'ADMIN',
      Librarian: 'LIBRARIAN',
      Bursar: 'BURSAR',
    };

    for (const row of rows) {
      try {
        const { name, email, role, teacherType, assignedClass, assignedSubjects } = row;
        if (!name || !email || !role) {
          results.errors.push({ row, error: 'Missing required fields' });
          continue;
        }
        const enumRole = roleMap[role];
        if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
          results.errors.push({ row, error: 'Invalid role' });
          continue;
        }

        const hashedPassword = await bcrypt.hash('password123', 10);
        const subjectsArray = parseAssignedSubjects(assignedSubjects);

        const user = await staffService.createStaff({
          name,
          email,
          role: enumRole,
          hashedPassword,
          teacherType,
          assignedClass,
          assignedSubjects: subjectsArray,
        });
        results.created.push(user);
      } catch (err: any) {
        results.errors.push({ row, error: err.message });
      }
    }
    return results;
  },
};