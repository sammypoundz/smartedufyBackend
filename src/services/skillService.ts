import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const skillService = {
  // Global skill operations – middleware adds schoolId to where
  getAll: () => prisma.skill.findMany(),

  getById: async (id: string | null | undefined) => {
    if (!id) throw new Error('Skill ID is required');
    const skill = await prisma.skill.findUnique({
      where: { id }, // middleware adds schoolId
      include: {
        subjects: {
          include: { subject: true },
        },
      },
    });
    if (!skill) throw new Error('Skill not found');
    return skill;
  },

  create: async (data: { name: string; description?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const createData: any = {
      name: data.name,
      schoolId: tenantId,
    };
    if (data.description !== undefined) createData.description = data.description;
    return prisma.skill.create({ data: createData });
  },

  update: async (id: string | null | undefined, data: { name?: string; description?: string }) => {
    if (!id) throw new Error('Skill ID is required');
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    return prisma.skill.update({
      where: { id, schoolId: tenantId },
      data: updateData,
    });
  },

  delete: async (id: string | null | undefined) => {
    if (!id) throw new Error('Skill ID is required');
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.skill.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // Arm-specific operations
  getByArmId: async (armId: string) => {
    const armSkills = await prisma.armSkill.findMany({
      where: { armId }, // middleware adds schoolId
      select: { skillId: true },
    });
    const skillIds = armSkills.map((as: { skillId: string }) => as.skillId);
    if (skillIds.length === 0) return [];
    return prisma.skill.findMany({
      where: { id: { in: skillIds } },
    });
  },

  linkToArm: async (skillId: string, armId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.armSkill.create({
      data: {
        skillId,
        armId,
        schoolId: tenantId,
      },
    });
  },

  removeFromArm: async (armId: string, skillId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.armSkill.deleteMany({
      where: {
        armId,
        skillId,
        schoolId: tenantId,
      },
    });
  },

  // Get skills by subject using SubjectSkill join table
  getBySubjectId: async (subjectId: string) => {
    const subjectSkills = await prisma.subjectSkill.findMany({
      where: { subjectId }, // middleware adds schoolId
      select: { skillId: true },
    });
    const skillIds = subjectSkills.map((ss: { skillId: string }) => ss.skillId);
    if (skillIds.length === 0) return [];
    return prisma.skill.findMany({
      where: { id: { in: skillIds } },
      orderBy: { name: 'asc' },
    });
  },
};