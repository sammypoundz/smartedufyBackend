import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const classService = {
  /**
   * Get all classes with arms, each arm including its teacher and student count.
   */
  getAll: () =>
    prisma.class.findMany({
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
      },
    }), // middleware adds schoolId

  /**
   * Get a single class by ID, including arms with teacher and student count.
   */
  getById: (id: string) =>
    prisma.class.findUnique({
      where: { id }, // middleware adds schoolId
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
      },
    }),

  /**
   * Create a new class.
   */
  create: async (name: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.class.create({
      data: { name, schoolId: tenantId },
    });
  },

  /**
   * Update a class name.
   */
  update: async (id: string, name: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.class.update({
      where: { id, schoolId: tenantId },
      data: { name },
    });
  },

  /**
   * Delete a class and all its dependent data (arms, students, attendance, results, etc.).
   */
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Get all arm IDs for this class, ensuring they belong to the tenant
    const arms = await prisma.arm.findMany({
      where: { classId: id, schoolId: tenantId },
      select: { id: true },
    });
    const armIds = arms.map(arm => arm.id);

    // 2. Get all student IDs for these arms
    let studentIds: string[] = [];
    if (armIds.length > 0) {
      const students = await prisma.student.findMany({
        where: { armId: { in: armIds }, schoolId: tenantId },
        select: { id: true },
      });
      studentIds = students.map(student => student.id);
    }

    // 3. Delete records that depend on students
    if (studentIds.length > 0) {
      await prisma.attendance.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.studentSubject.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.result.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.student.deleteMany({
        where: { id: { in: studentIds }, schoolId: tenantId },
      });
    }

    // 4. Delete records that depend on arms
    if (armIds.length > 0) {
      await prisma.timetableEntry.deleteMany({
        where: { armId: { in: armIds }, schoolId: tenantId },
      });
      await prisma.armSkill.deleteMany({
        where: { armId: { in: armIds }, schoolId: tenantId },
      });
      await prisma.subjectArm.deleteMany({
        where: { armId: { in: armIds }, schoolId: tenantId },
      });
      await prisma.arm.deleteMany({
        where: { id: { in: armIds }, schoolId: tenantId },
      });
    }

    // 5. Finally delete the class
    return prisma.class.delete({
      where: { id, schoolId: tenantId },
    });
  },
};

// ----------------------------------------------------------------------
// Arm service – separate CRUD operations for arms (used by frontend)
// ----------------------------------------------------------------------
export const armService = {
  /**
   * Create a new arm under a class.
   */
  create: async (data: {
    letter: string;
    alias?: string;
    classId: string;
    teacherId: string;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.arm.create({
      data: {
        letter: data.letter,
        alias: data.alias,
        classId: data.classId,
        teacherId: data.teacherId,
        schoolId: tenantId,
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
  },

  /**
   * Update an existing arm (partial update).
   */
  update: async (id: string, data: {
    letter?: string;
    alias?: string;
    teacherId?: string;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.arm.update({
      where: { id, schoolId: tenantId },
      data,
      include: {
        teacher: {
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
  },

  /**
   * Delete an arm – also removes all dependent data (students, results, etc.).
   * Note: The frontend may want to handle cascading deletes manually or rely on
   * Prisma's `onDelete: Cascade` in the schema. This service provides a manual
   * cascade for safety.
   */
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Get all students in this arm, ensuring they belong to the tenant
    const students = await prisma.student.findMany({
      where: { armId: id, schoolId: tenantId },
      select: { id: true },
    });
    const studentIds = students.map(s => s.id);

    // 2. Delete student-dependent records
    if (studentIds.length > 0) {
      await prisma.attendance.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.studentSubject.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.result.deleteMany({
        where: { studentId: { in: studentIds }, schoolId: tenantId },
      });
      await prisma.student.deleteMany({
        where: { id: { in: studentIds }, schoolId: tenantId },
      });
    }

    // 3. Delete arm-dependent records
    await prisma.timetableEntry.deleteMany({
      where: { armId: id, schoolId: tenantId },
    });
    await prisma.armSkill.deleteMany({
      where: { armId: id, schoolId: tenantId },
    });
    await prisma.subjectArm.deleteMany({
      where: { armId: id, schoolId: tenantId },
    });

    // 4. Finally delete the arm
    return prisma.arm.delete({
      where: { id, schoolId: tenantId },
    });
  },
};