import prisma from '../config/db';
import { Prisma } from '@prisma/client';
import { getCurrentTenantId } from '../utils/tenantContext';

export const payrollService = {
  getAllPayroll: async () => {
    const payroll = await prisma.payroll.findMany({
      include: {
        staff: {
          include: {
            teacher: true,
            student: true,
          },
        },
      },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    }); // middleware adds schoolId to Payroll query

    return payroll.map(p => ({
      ...p,
      staffName: p.staff.teacher?.name || p.staff.student?.name || p.staff.email,
      role: p.staff.role,
    }));
  },

  getStaffForPayroll: async (roles: string[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const users = await prisma.user.findMany({
      where: {
        role: { in: roles as any },
        schoolId: tenantId,
        OR: [
          { teacher: { isNot: null } },
          { student: { isNot: null } },
        ],
      },
      include: {
        teacher: true,
        student: true,
      },
    });
    return users.map(user => ({
      id: user.id,
      name: user.teacher?.name || user.student?.name || user.email,
      role: user.role,
      email: user.email,
    }));
  },

  createPayroll: async (data: {
    staffId: string;
    amount: number;
    month: string;
    status: 'PAID' | 'PENDING' | 'OVERDUE';
    notes?: string;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const existing = await prisma.payroll.findFirst({
      where: {
        staffId: data.staffId,
        month: data.month,
        schoolId: tenantId,
      },
    });
    if (existing) {
      throw new Error(`Payroll for this staff in ${data.month} already exists. Use update instead.`);
    }

    const created = await prisma.payroll.create({
      data: {
        staffId: data.staffId,
        amount: data.amount,
        month: data.month,
        status: data.status,
        notes: data.notes,
        paymentDate: data.status === 'PAID' ? new Date() : undefined,
        schoolId: tenantId,
      },
      include: {
        staff: {
          include: {
            teacher: true,
            student: true,
          },
        },
      },
    });
    return {
      ...created,
      staffName: created.staff.teacher?.name || created.staff.student?.name || created.staff.email,
      role: created.staff.role,
    };
  },

  updatePayroll: async (id: string, data: Partial<{
    amount: number;
    month: string;
    status: 'PAID' | 'PENDING' | 'OVERDUE';
    notes: string;
  }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updateData: any = { ...data };
    if (data.status === 'PAID' && !updateData.paymentDate) {
      updateData.paymentDate = new Date();
    }
    const updated = await prisma.payroll.update({
      where: { id, schoolId: tenantId },
      data: updateData,
      include: {
        staff: {
          include: {
            teacher: true,
            student: true,
          },
        },
      },
    });
    return {
      ...updated,
      staffName: updated.staff.teacher?.name || updated.staff.student?.name || updated.staff.email,
      role: updated.staff.role,
    };
  },

  deletePayroll: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.payroll.delete({
      where: { id, schoolId: tenantId },
    });
  },
};