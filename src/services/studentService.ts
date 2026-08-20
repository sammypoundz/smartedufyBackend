import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

export const studentService = {
  // ---------- Existing methods ----------
  getAll: async (armId?: string) => {
    const where: any = {};
    if (armId) where.armId = armId;
    return prisma.student.findMany({
      where,
      include: { parent: true, class: true, arm: true, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getByArmId: (armId: string | null | undefined) => {
    if (!armId) throw new Error('Arm ID is required');
    return prisma.student.findMany({
      where: { armId },
      include: { parent: true, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getByClassId: (classId: string | null | undefined) => {
    if (!classId) throw new Error('Class ID is required');
    return prisma.student.findMany({
      where: { classId },
      include: { parent: true, arm: true, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getById: (id: string | null | undefined) => {
    if (!id) throw new Error('Student ID is required');
    return prisma.student.findUnique({
      where: { id },
      include: { parent: true, class: true, arm: true, attendance: true, results: true },
    }); // middleware adds schoolId
  },

  getByUserId: (userId: string | null | undefined) => {
    if (!userId) throw new Error('User ID is required');
    return prisma.student.findUnique({
      where: { userId },
      include: {
        arm: { include: { class: true } },
        user: { select: { email: true, role: true } },
        parent: true,
      },
    }); // middleware adds schoolId
  },

  findByAdmissionAndArm: (admissionNumber: string, armId: string) => {
    return prisma.student.findFirst({
      where: { admissionNumber, armId },
      include: { arm: { include: { class: true } } },
    }); // middleware adds schoolId
  },

  create: async (data: { name: string; gender?: string; admissionNumber?: string; classId?: string; armId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const email = `${data.name.toLowerCase().replace(/\s/g, '.')}@student.smartedufy.com`;
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email,
        password: hashedPassword,
        role: 'STUDENT',
        isActive: true,
        schoolId: tenantId,
      },
    });

    return prisma.student.create({
      data: {
        name: data.name,
        gender: data.gender || '',
        admissionNumber: data.admissionNumber,
        classId: data.classId,
        armId: data.armId,
        userId: user.id,
        schoolId: tenantId,
      },
      include: { parent: true },
    });
  },

  async createParentWithUser(parentData: { name: string; email: string; phone?: string }) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    let user = await prisma.user.findUnique({ where: { email: parentData.email } });
    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      user = await prisma.user.create({
        data: {
          name: parentData.name,
          email: parentData.email,
          password: hashedPassword,
          role: 'PARENT',
          isActive: true,
          schoolId: tenantId,
        },
      });
    }
    // Ensure parent record belongs to tenant
    const existingParent = await prisma.parent.findUnique({
      where: { userId: user.id },
    });
    if (existingParent) return existingParent;
    return prisma.parent.create({
      data: {
        userId: user.id,
        name: parentData.name,
        email: parentData.email,
        phone: parentData.phone || '',
        schoolId: tenantId,
      },
    });
  },

  update: async (
    id: string | null | undefined,
    data: {
      name?: string;
      gender?: string;
      dateOfBirth?: string;
      address?: string;
      admissionNumber?: string;
      classId?: string;
      armId?: string;
      parentId?: string | null;
      newParent?: { name: string; email: string; phone?: string };
      guardianRelationship?: string;
      isActive?: boolean;
    }
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!id) throw new Error('Student ID is required');

    const updateData: Partial<{
      name: string;
      gender: string;
      dateOfBirth: Date | null;
      address: string | null;
      admissionNumber: string | null;
      classId: string | null;
      armId: string | null;
      parentId: string | null;
      guardianRelationship: string | null;
      isActive: boolean;
    }> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.admissionNumber !== undefined) updateData.admissionNumber = data.admissionNumber;
    if (data.classId !== undefined) updateData.classId = data.classId;
    if (data.armId !== undefined) updateData.armId = data.armId;
    if (data.guardianRelationship !== undefined) updateData.guardianRelationship = data.guardianRelationship;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Handle parentId – allow null, empty string, or valid ID
    if (data.parentId !== undefined) {
      if (data.parentId) {
        const parentExists = await prisma.parent.findFirst({
          where: { id: data.parentId, schoolId: tenantId },
        });
        if (!parentExists) throw new Error('Parent not found in this tenant');
      }
      updateData.parentId = data.parentId;
    }
    if (data.newParent) {
      const newParent = await studentService.createParentWithUser(data.newParent);
      updateData.parentId = newParent.id;
    }

    return prisma.student.update({
      where: { id, schoolId: tenantId },
      data: updateData,
      include: { parent: true, class: true, arm: true },
    });
  },

  assignParent: async (studentId: string | null | undefined, parentId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!studentId) throw new Error('Student ID is required');

    // Verify parent belongs to tenant
    const parentExists = await prisma.parent.findFirst({
      where: { id: parentId, schoolId: tenantId },
    });
    if (!parentExists) throw new Error('Parent not found in this tenant');

    return prisma.student.update({
      where: { id: studentId, schoolId: tenantId },
      data: { parentId },
      include: { parent: true },
    });
  },

  unassignParent: async (studentId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.student.update({
      where: { id: studentId, schoolId: tenantId },
      data: { parentId: null },
      include: { parent: true },
    });
  },

  delete: async (id: string | null | undefined) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!id) throw new Error('Student ID is required');

    await prisma.studentSubject.deleteMany({
      where: { studentId: id, schoolId: tenantId },
    });
    return prisma.student.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // ---------- Additional methods ----------
  getAllParents: () =>
    prisma.parent.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }), // middleware adds schoolId

  createParent: async (data: { name: string; email: string; phone?: string }) => {
    return studentService.createParentWithUser(data);
  },

  getStudentSubjects: async (studentId: string) => {
    const links = await prisma.studentSubject.findMany({
      where: { studentId },
      include: { subject: true },
    }); // middleware adds schoolId
    return links.map(link => link.subject);
  },

  updateStudentSubjects: async (studentId: string, subjectIds: string[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    await prisma.studentSubject.deleteMany({
      where: { studentId, schoolId: tenantId },
    });
    if (subjectIds.length > 0) {
      await prisma.studentSubject.createMany({
        data: subjectIds.map(subjectId => ({
          studentId,
          subjectId,
          schoolId: tenantId,
        })),
      });
    }
    return studentService.getStudentSubjects(studentId);
  },

  getStudentAttendance: (studentId: string) =>
    prisma.attendance.findMany({
      where: { studentId },
      select: { date: true, present: true },
      orderBy: { date: 'desc' },
    }), // middleware adds schoolId

  getStudentFees: async (studentId: string) => {
    try {
      return [];
    } catch {
      return [];
    }
  },

  getStudentResults: async (studentId: string) => {
    const results = await prisma.result.findMany({
      where: { studentId },
      include: { subject: true },
      orderBy: [{ term: 'desc' }, { subject: { name: 'asc' } }],
    }); // middleware adds schoolId
    return results.map(result => ({
      subject: result.subject.name,
      score: result.score,
      grade: result.grade || '',
      term: result.term,
    }));
  },
};