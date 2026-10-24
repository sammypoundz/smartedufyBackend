import prisma from '../config/db';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

// ---------- Helper: build staff response ----------
export const buildStaffResponse = async (user: any) => {
  // Multi-role aware: a user may hold TEACHER as a secondary role
  // (e.g. roles = [ACCOUNTANT, TEACHER]), not just as the primary role.
  const heldRoles: string[] = Array.from(
    new Set([...(user.roles || []), user.role]),
  ).filter(Boolean);
  let teacherData = null;
  if (heldRoles.includes('TEACHER')) {
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
    roles: heldRoles,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };

  if (heldRoles.includes('TEACHER') && teacherData) {
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
    // Multi-role aware: include users whose primary role OR any secondary
    // role (in `roles`) is a staff role — including custom roles created on
    // the Roles & Privileges page (they are neither parents nor students).
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { role: { notIn: ['PARENT', 'STUDENT'] } },
          {
            OR: [
              { role: { in: STAFF_ROLES } },
              { roles: { hasSome: STAFF_ROLES as any } },
              // Custom-role-only users: they hold at least one role that is
              // not a system role (parent/student were excluded above).
              // Prisma has no NOT-hasSome on scalars, so fetch everyone with
              // a roles array and filter custom-role-only users in memory.
              {
                roles: { isEmpty: false },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    // Drop users whose roles contain ONLY system roles not in STAFF_ROLES
    // (e.g. PARENT/STUDENT as secondary roles) — they are not staff.
    const ALL_SYSTEM: string[] = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'VICE_PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN', 'PARENT', 'STUDENT'];
    const filtered = users.filter((u) => {
      const held = [...(u.roles || []), u.role].filter(Boolean);
      const staffRoles = held.filter((r) => (STAFF_ROLES as string[]).includes(r));
      if (staffRoles.length) return true;
      // No staff system role: keep only if they hold a custom (non-system) role.
      return held.some((r) => !ALL_SYSTEM.includes(r));
    });
    return Promise.all(filtered.map(buildStaffResponse));
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
    /** Explicit roles array (used when the primary role is a custom role). */
    roles?: string[];
    extraRoles?: string[];
    hashedPassword: string;
    teacherType?: string;
    assignedClass?: string;
    assignedSubjects?: { subject: string; class: string }[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const { name, email, role, roles: explicitRoles, extraRoles, hashedPassword, teacherType, assignedClass, assignedSubjects } = data;
    // Dual-role support: secondary roles chosen in the staff form (e.g. an
    // Accountant who also teaches) are stored in User.roles so privilege
    // resolution, the Teachers page and teacher functions all see them.
    // When `roles` is provided explicitly (custom primary role), use it.
    const roles = explicitRoles
      ? Array.from(new Set([...explicitRoles, role]))
      : Array.from(new Set([...(extraRoles || []), role]));
    const isTeacher = roles.includes('TEACHER');

    // Create the user and any role-specific records atomically
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
          roles,
          isActive: true,
          schoolId: tenantId,
        },
      });

      if (isTeacher) {
        const teacher = await tx.teacher.create({
          data: {
            name: name || '',
            email,
            userId: createdUser.id,
            schoolId: tenantId,
          },
        });

        if (teacherType === 'class_teacher' && assignedClass) {
          const arm = await tx.arm.findFirst({
            where: { class: { name: assignedClass }, schoolId: tenantId },
          });
          if (arm) {
            await tx.arm.update({
              where: { id: arm.id, schoolId: tenantId },
              data: { teacherId: teacher.id },
            });
          }
        }

        if (teacherType === 'subject_teacher' && assignedSubjects?.length) {
          for (const subj of assignedSubjects) {
            const subject = await tx.subject.findFirst({
              where: { name: subj.subject, schoolId: tenantId },
            });
            const arm = await tx.arm.findFirst({
              where: { class: { name: subj.class }, schoolId: tenantId },
            });
            if (subject && arm) {
              await tx.subjectArm.create({
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

      return createdUser;
    });

    return buildStaffResponse(user);
  },

  updateStaff: async (id: string, data: {
    name?: string;
    email?: string;
    role?: Role;
    /** Explicit full roles array (used when a custom role is involved). */
    roles?: string[];
    extraRoles?: string[];
    teacherType?: string;
    assignedClass?: string;
    assignedSubjects?: { subject: string; class: string }[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const { name, email, role, roles: explicitRoles, extraRoles, teacherType, assignedClass, assignedSubjects } = data;

    const user = await prisma.user.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!user) throw new Error('Staff not found');

    const userUpdateData: any = {};
    if (name !== undefined) userUpdateData.name = name;
    if (email !== undefined) userUpdateData.email = email;
    if (role !== undefined) userUpdateData.role = role;
    // Dual-role support: `extraRoles` carries the secondary roles chosen in
    // the staff form. When provided, rebuild the full roles array (always
    // including the effective primary role) so editing a user keeps every
    // role they hold.
    if (explicitRoles !== undefined) {
      // Explicit roles array (custom-role aware) wins when provided.
      userUpdateData.roles = Array.from(new Set([...explicitRoles, ...(role !== undefined ? [role] : [])]));
    } else if (extraRoles !== undefined) {
      const primary = role !== undefined ? role : user.role;
      userUpdateData.roles = Array.from(new Set([...(extraRoles || []), primary]));
    }

    const updatedUser = await prisma.user.update({
      where: { id, schoolId: tenantId },
      data: userUpdateData,
    });

    // Handle teacher sync — TEACHER may be primary or a secondary role.
    const effectiveRoles = Array.from(new Set([...(userUpdateData.roles || []), userUpdateData.role || user.role])).filter(Boolean);
    if (effectiveRoles.includes('TEACHER')) {
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
    } else if (role !== undefined) {
      // Only remove the Teacher profile when the primary role was EXPLICITLY
      // changed away from TEACHER. The else-branch used to run on every
      // update (even a simple name edit of a non-teacher), silently deleting
      // the Teacher profile of dual-role users (e.g. ACCOUNTANT + TEACHER).
      const heldRoles = Array.from(new Set([...(updatedUser.roles || []), updatedUser.role])).filter(Boolean);
      if (!heldRoles.includes('TEACHER')) {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: id, schoolId: tenantId },
        });
        if (teacher) {
          await prisma.teacher.delete({
            where: { id: teacher.id, schoolId: tenantId },
          });
        }
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

    // Delete all related records atomically so no orphaned rows remain
    // (Payroll has onDelete: Cascade and cleans itself up)
    await prisma.$transaction(async (tx) => {
      if (user.role === 'TEACHER') {
        const teacher = await tx.teacher.findUnique({
          where: { userId: id, schoolId: tenantId },
        });
        if (teacher) {
          // Release arms and subject-arm assignments
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
          await tx.teacher.delete({
            where: { id: teacher.id, schoolId: tenantId },
          });
        }
      }

      await tx.user.delete({
        where: { id, schoolId: tenantId },
      });
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