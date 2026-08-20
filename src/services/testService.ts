import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const testService = {
  getAll: (filters?: { armId?: string; status?: string }) => {
    const where: any = {};
    if (filters?.armId) where.armId = filters.armId;
    if (filters?.status) where.status = filters.status;
    // middleware adds schoolId automatically
    return prisma.test.findMany({
      where,
      include: { class: true, arm: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  getById: (id: string) =>
    prisma.test.findUnique({
      where: { id }, // middleware adds schoolId
      include: { class: true, arm: true, questions: true },
    }),

  create: async (data: {
    name: string;
    classId: string;
    armId: string;
    subjects: string[];
    questionCount: number;
    duration: number;
    status?: 'DRAFT' | 'PUBLISHED';
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.test.create({
      data: {
        ...data,
        schoolId: tenantId,
      },
    });
  },

  update: async (
    id: string,
    data: Partial<{
      name: string;
      classId: string;
      armId: string;
      subjects: string[];
      questionCount: number;
      duration: number;
      status: 'DRAFT' | 'PUBLISHED';
    }>
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.test.update({
      where: { id, schoolId: tenantId },
      data,
    });
  },

  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Delete all questions belonging to this test (scoped by tenant)
    await prisma.question.deleteMany({
      where: { testId: id, schoolId: tenantId },
    });
    // 2. Then delete the test itself
    return prisma.test.delete({
      where: { id, schoolId: tenantId },
    });
  },
};