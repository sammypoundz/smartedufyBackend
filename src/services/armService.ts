import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const armService = {
  // Get all arms for a specific class, including teacher, students (with parent), subjects, and skills
  getByClassId: (classId: string) =>
    prisma.arm.findMany({
      where: { classId }, // middleware adds schoolId automatically
      include: {
        teacher: true,
        students: {
          include: { parent: true },
        },
        subjects: {
          include: {
            subject: true,
            teacher: true,
          },
        },
        skills: {
          include: { skill: true },
        },
      },
    }),

  // Get a single arm by ID, including teacher, students (with parent), subjects, and skills
  getById: (id: string) =>
    prisma.arm.findUnique({
      where: { id }, // middleware adds schoolId automatically
      include: {
        teacher: true,
        students: {
          include: { parent: true },
        },
        subjects: {
          include: {
            subject: true,
            teacher: true,
          },
        },
        skills: {
          include: { skill: true },
        },
      },
    }),

  // Get all arms with class relation (for teacher dropdowns)
  getAll: () =>
    prisma.arm.findMany({
      include: { class: true },
      orderBy: { class: { name: 'asc' } },
    }), // middleware adds schoolId

  // Create a new arm
  create: async (data: { letter: string; alias?: string; classId: string; teacherId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.arm.create({
      data: {
        ...data,
        schoolId: tenantId,
      },
      include: { teacher: true, students: true },
    });
  },

  // Update an arm
  update: async (id: string, data: { letter?: string; alias?: string; teacherId?: string | null }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updateData: any = {};
    if (data.letter !== undefined) updateData.letter = data.letter;
    if (data.alias !== undefined) updateData.alias = data.alias;
    if (data.teacherId !== undefined) updateData.teacherId = data.teacherId;

    return prisma.arm.update({
      where: { id, schoolId: tenantId },
      data: updateData,
      include: { teacher: true, students: true },
    });
  },

  // Delete an arm
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.arm.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // Add a subject to an arm
  addSubjectToArm: async (armId: string, subjectId: string, teacherId?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.subjectArm.create({
      data: {
        armId,
        subjectId,
        teacherId,
        schoolId: tenantId,
      },
      include: { subject: true, teacher: true },
    });
  },

  // Add a skill to an arm
  addSkillToArm: async (armId: string, skillId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.armSkill.create({
      data: {
        armId,
        skillId,
        schoolId: tenantId,
      },
      include: { skill: true },
    });
  },

  // ---------- Methods for subject management ----------
  // Get all subjects assigned to an arm (with subject and teacher details)
  getArmSubjects: (armId: string) =>
    prisma.subjectArm.findMany({
      where: { armId }, // middleware adds schoolId
      include: {
        subject: true,
        teacher: true,
      },
      orderBy: { subject: { name: 'asc' } },
    }),

  // Get only the subjects (without teacher details) – used by results page
  getSubjectsByArmId: (armId: string) =>
    prisma.subjectArm.findMany({
      where: { armId }, // middleware adds schoolId
      select: {
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { subject: { name: 'asc' } },
    }).then(subjectArms => subjectArms.map(sa => sa.subject)),

  // Update the teacher for a specific arm‑subject relation
  updateArmSubjectTeacher: async (armId: string, subjectId: string, teacherId?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relation = await prisma.subjectArm.findFirst({
      where: { armId, subjectId, schoolId: tenantId },
    });
    if (!relation) return null;

    return prisma.subjectArm.update({
      where: { id: relation.id, schoolId: tenantId },
      data: { teacherId: teacherId || null },
      include: { subject: true, teacher: true },
    });
  },

  // Remove a subject from an arm (by armId and subjectId)
  removeArmSubject: async (armId: string, subjectId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relation = await prisma.subjectArm.findFirst({
      where: { armId, subjectId, schoolId: tenantId },
    });
    if (!relation) return null;

    return prisma.subjectArm.delete({
      where: { id: relation.id, schoolId: tenantId },
    });
  },

  // Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
  deleteSubjectArm: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.subjectArm.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // ---------- Methods for student management (results page) ----------
  // Get all students in an arm (basic info: id, name, admissionNumber)
  getStudentsByArmId: (armId: string) =>
    prisma.student.findMany({
      where: { armId }, // middleware adds schoolId
      select: {
        id: true,
        name: true,
        admissionNumber: true,
      },
      orderBy: { name: 'asc' },
    }),
};