import prisma from '../config/db';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentTenantId } from '../utils/tenantContext';

export const lessonPlanService = {
  // Get all lesson plans with optional filters (classId, armId, subjectId)
  getAll: async (filters?: { classId?: string; armId?: string; subjectId?: string }) => {
    const where: any = {};
    if (filters?.classId) where.classId = filters.classId;
    if (filters?.armId) where.armId = filters.armId;
    if (filters?.subjectId) where.subjectId = filters.subjectId;

    // middleware adds schoolId to where automatically
    return prisma.lessonPlan.findMany({
      where,
      include: {
        class: { select: { name: true } },
        arm: { select: { letter: true } },
        subject: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getById: (id: string) =>
    prisma.lessonPlan.findUnique({
      where: { id }, // middleware adds schoolId
      include: {
        class: { select: { name: true } },
        arm: { select: { letter: true } },
        subject: { select: { name: true } },
      },
    }),

  create: async (data: {
    title: string;
    description?: string;
    classId: string;
    armId: string;
    subjectId: string;
    fileUrl: string;
    fileName: string;
    fileType: string;
    status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.lessonPlan.create({
      data: {
        ...data,
        status: data.status || 'DRAFT',
        schoolId: tenantId,
      },
    });
  },

  update: async (
    id: string,
    data: {
      title?: string;
      description?: string;
      classId?: string;
      armId?: string;
      subjectId?: string;
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
    }
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.lessonPlan.update({
      where: { id, schoolId: tenantId },
      data,
    });
  },

  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Optionally delete the physical file? Currently not implemented.
    return prisma.lessonPlan.delete({
      where: { id, schoolId: tenantId },
    });
  },

  getFileInfo: (id: string) =>
    prisma.lessonPlan.findUnique({
      where: { id }, // middleware adds schoolId
      select: { fileUrl: true, fileName: true, fileType: true },
    }),
};