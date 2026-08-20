import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const questionService = {
  getByTestId: (testId: string) =>
    prisma.question.findMany({
      where: { testId }, // middleware adds schoolId
      orderBy: { createdAt: 'asc' },
      include: { subject: true },
    }),

  getById: (id: string) =>
    prisma.question.findUnique({
      where: { id }, // middleware adds schoolId
      include: { subject: true },
    }),

  create: async (data: {
    testId: string;
    subjectId?: string | null;
    text: string;
    options: string[];
    correctOption: number;
    marks: number;
    attachmentType?: string | null;
    attachmentUrl?: string | null;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    console.log('📥 questionService.create - received data:', JSON.stringify(data, null, 2));
    const result = prisma.question.create({
      data: {
        testId: data.testId,
        subjectId: data.subjectId ?? null,
        text: data.text,
        options: data.options,
        correctOption: data.correctOption,
        marks: data.marks,
        attachmentType: data.attachmentType ?? null,
        attachmentUrl: data.attachmentUrl ?? null,
        schoolId: tenantId, // 👈 required
      },
    });
    result.then(question => {
      console.log('✅ question created:', { id: question.id, subjectId: question.subjectId });
    }).catch(err => console.error('❌ Prisma create error:', err));
    return result;
  },

  update: async (
    id: string,
    data: Partial<{
      subjectId?: string | null;
      text: string;
      options: string[];
      correctOption: number;
      marks: number;
      attachmentType?: string | null;
      attachmentUrl?: string | null;
    }>
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.question.update({
      where: { id, schoolId: tenantId },
      data: {
        subjectId: data.subjectId !== undefined ? data.subjectId : undefined,
        text: data.text,
        options: data.options,
        correctOption: data.correctOption,
        marks: data.marks,
        attachmentType: data.attachmentType !== undefined ? data.attachmentType : undefined,
        attachmentUrl: data.attachmentUrl !== undefined ? data.attachmentUrl : undefined,
      },
    });
  },

  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.question.delete({
      where: { id, schoolId: tenantId },
    });
  },
};