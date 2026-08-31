import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';
import { syncService } from './syncService';

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

    // Integrity: validate all referenced entities belong to this school
    await syncService.validateSubjectArmLink(tenantId, subjectId, armId, teacherId);

    // Idempotent link: never create duplicates
    const existing = await prisma.subjectArm.findFirst({
      where: { armId, subjectId, schoolId: tenantId },
    });
    if (existing) {
      return prisma.subjectArm.update({
        where: { id: existing.id, schoolId: tenantId },
        data: { teacherId: teacherId ?? existing.teacherId },
        include: { subject: true, teacher: true },
      });
    }

    const link = await prisma.subjectArm.create({
      data: {
        armId,
        subjectId,
        teacherId,
        schoolId: tenantId,
      },
      include: { subject: true, teacher: true },
    });

    // Keep SubjectTeacher join table in sync
    if (teacherId) {
      await syncService.ensureSubjectTeacher(prisma, tenantId, subjectId, teacherId);
    }
    // Enroll students of this arm into the newly offered subject
    await syncService.syncStudentSubjectsForArm(tenantId, armId);
    return link;
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

    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId: tenantId } });
      if (!teacher) throw new Error('Teacher not found in this school');
    }

    const updated = await prisma.subjectArm.update({
      where: { id: relation.id, schoolId: tenantId },
      data: { teacherId: teacherId || null },
      include: { subject: true, teacher: true },
    });

    // Sync SubjectTeacher join table both ways (add new, prune old)
    if (teacherId) {
      await syncService.ensureSubjectTeacher(prisma, tenantId, subjectId, teacherId);
    }
    if (relation.teacherId && relation.teacherId !== teacherId) {
      await syncService.pruneSubjectTeachers(prisma, tenantId, subjectId, relation.teacherId);
    }
    return updated;
  },

  // Remove a subject from an arm (by armId and subjectId)
  removeArmSubject: async (armId: string, subjectId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relation = await prisma.subjectArm.findFirst({
      where: { armId, subjectId, schoolId: tenantId },
    });
    if (!relation) return null;

    const removed = await prisma.subjectArm.delete({
      where: { id: relation.id, schoolId: tenantId },
    });

    // Prune now-orphaned SubjectTeacher link
    if (relation.teacherId) {
      await syncService.pruneSubjectTeachers(prisma, tenantId, subjectId, relation.teacherId);
    }
    // Un-enroll students of this arm from the removed subject
    await prisma.studentSubject.deleteMany({
      where: { schoolId: tenantId, subjectId, student: { armId } },
    });
    return removed;
  },

  // Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
  deleteSubjectArm: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relation = await prisma.subjectArm.findFirst({
      where: { id, schoolId: tenantId },
    });
    if (!relation) throw new Error('Subject-arm relation not found');

    const removed = await prisma.subjectArm.delete({ where: { id, schoolId: tenantId } });

    if (relation.teacherId) {
      await syncService.pruneSubjectTeachers(prisma, tenantId, relation.subjectId, relation.teacherId);
    }
    await prisma.studentSubject.deleteMany({
      where: { schoolId: tenantId, subjectId: relation.subjectId, student: { armId: relation.armId } },
    });
    return removed;
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