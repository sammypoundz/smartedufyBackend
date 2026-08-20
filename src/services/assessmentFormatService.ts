import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const assessmentFormatService = {
  /**
   * Get all assessment formats (scoped to the current tenant via middleware).
   */
  getAll: () => {
    return prisma.assessmentFormat.findMany({
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Get a single assessment format by ID (scoped to the current tenant via middleware).
   */
  getById: (id: string) => {
    return prisma.assessmentFormat.findUnique({ where: { id } });
  },

  /**
   * Create a new assessment format.
   * Validates that CA + Exam = 100 and ensures the format name is unique per tenant.
   */
  create: async (data: { name: string; ca: number; exam: number }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const total = data.ca + data.exam;
    if (total !== 100) throw new Error('CA and Exam must sum to 100');

    // Check if format with same name already exists for this tenant
    const existing = await prisma.assessmentFormat.findFirst({
      where: { name: data.name, schoolId: tenantId },
    });
    if (existing) {
      throw new Error(`Assessment format "${data.name}" already exists for this school.`);
    }

    return prisma.assessmentFormat.create({
      data: {
        name: data.name,
        ca: data.ca,
        exam: data.exam,
        total,
        schoolId: tenantId,
      },
    });
  },

  /**
   * Update an existing assessment format.
   * Validates CA + Exam = 100 and ensures name uniqueness within the tenant.
   */
  update: async (id: string, data: { name?: string; ca?: number; exam?: number }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Use transaction to fetch existing and perform atomic update
    return prisma.$transaction(async (tx) => {
      // Ensure record exists and belongs to this tenant
      const existing = await tx.assessmentFormat.findUnique({
        where: { id, schoolId: tenantId },
      });
      if (!existing) throw new Error('Assessment format not found or does not belong to this school');

      // Calculate new CA/Exam totals
      const newCa = data.ca ?? existing.ca;
      const newExam = data.exam ?? existing.exam;
      const total = newCa + newExam;
      if (total !== 100) throw new Error('CA and Exam must sum to 100');

      // If name is being changed, check for uniqueness within tenant
      if (data.name && data.name !== existing.name) {
        const duplicate = await tx.assessmentFormat.findFirst({
          where: { name: data.name, schoolId: tenantId },
        });
        if (duplicate) {
          throw new Error(`Assessment format "${data.name}" already exists for this school.`);
        }
      }

      return tx.assessmentFormat.update({
        where: { id, schoolId: tenantId },
        data: {
          name: data.name,
          ca: newCa,
          exam: newExam,
          total,
        },
      });
    });
  },

  /**
   * Delete an assessment format (must belong to the current tenant).
   */
  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.assessmentFormat.delete({
      where: { id, schoolId: tenantId },
    });
  },
};