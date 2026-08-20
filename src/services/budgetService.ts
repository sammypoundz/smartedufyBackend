import prisma from '../config/db';
import { Prisma } from '@prisma/client';
import { getCurrentTenantId } from '../utils/tenantContext';

export const budgetService = {
  getAllBudgets: async () => {
    return prisma.budget.findMany({
      orderBy: [{ monthYear: 'desc' }, { category: 'asc' }],
    }); // middleware adds schoolId to where
  },

  createBudget: async (data: { category: string; amount: number; monthYear: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Check if budget already exists for this category and month within this tenant
    const existing = await prisma.budget.findFirst({
      where: {
        category: data.category,
        monthYear: data.monthYear,
        schoolId: tenantId,
      },
    });
    if (existing) {
      throw new Error(`Budget for ${data.category} in ${data.monthYear} already exists. Use update instead.`);
    }

    return prisma.budget.create({
      data: {
        ...data,
        schoolId: tenantId,
      },
    });
  },

  updateBudget: async (id: string, data: Partial<{ category: string; amount: number; monthYear: string }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Fetch current budget (ensuring it belongs to the tenant)
    const current = await prisma.budget.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!current) throw new Error('Budget not found');

    // Determine new category and monthYear (fallback to current if not changed)
    const newCategory = data.category ?? current.category;
    const newMonthYear = data.monthYear ?? current.monthYear;

    // If category or monthYear changes, check for conflict with another budget within the tenant
    if (newCategory !== current.category || newMonthYear !== current.monthYear) {
      const conflict = await prisma.budget.findFirst({
        where: {
          category: newCategory,
          monthYear: newMonthYear,
          schoolId: tenantId,
          id: { not: id }, // exclude itself
        },
      });
      if (conflict) {
        throw new Error(`A budget for ${newCategory} in ${newMonthYear} already exists.`);
      }
    }

    return prisma.budget.update({
      where: { id, schoolId: tenantId },
      data,
    });
  },

  deleteBudget: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.budget.delete({
      where: { id, schoolId: tenantId },
    });
  },
};