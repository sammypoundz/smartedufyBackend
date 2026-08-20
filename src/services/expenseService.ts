import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const expenseService = {
  getAll: async () => {
    return prisma.expense.findMany({
      orderBy: { date: 'desc' },
    }); // middleware adds schoolId to where
  },

  getById: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.expense.findUnique({
      where: { id, schoolId: tenantId },
    });
  },

  create: async (data: { description: string; amount: number; category: string; date: Date }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.expense.create({
      data: {
        ...data,
        schoolId: tenantId,
      },
    });
  },

  update: async (id: string, data: Partial<{ description: string; amount: number; category: string; date: Date }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.expense.update({
      where: { id, schoolId: tenantId },
      data,
    });
  },

  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.expense.delete({
      where: { id, schoolId: tenantId },
    });
  },
};