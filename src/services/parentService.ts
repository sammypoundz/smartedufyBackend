import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';

export const parentService = {
  getAll: () =>
    prisma.parent.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }), // middleware adds schoolId to where

  getById: (id: string) =>
    prisma.parent.findUnique({
      where: { id }, // middleware adds schoolId
      include: { children: true, user: { select: { email: true } } },
    }),

  create: async (data: { name: string; phone?: string; email: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    let user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: 'PARENT',
          isActive: true,
          schoolId: tenantId, // 👈 required
        },
      });
    }
    const existingParent = await prisma.parent.findUnique({ where: { userId: user.id } });
    if (existingParent) throw new Error('A parent record already exists for this user');

    return prisma.parent.create({
      data: {
        name: data.name,
        phone: data.phone || '',
        email: data.email,
        userId: user.id,
        schoolId: tenantId, // 👈 required
      },
      include: { children: true },
    });
  },

  update: (id: string, data: { name?: string; phone?: string; email?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.parent.update({
      where: { id, schoolId: tenantId }, // explicit scope
      data,
      include: { children: true },
    });
  },

  delete: (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.parent.delete({
      where: { id, schoolId: tenantId },
    });
  },
};