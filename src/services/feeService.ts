import prisma from '../config/db';
import { Prisma } from '@prisma/client';
import { sendEmail, sendSMS } from '../utils/messaging';
import { getCurrentTenantId } from '../utils/tenantContext';

type BreakdownItem = { name: string; amount: number };
type PaymentBreakdownItem = { itemName: string; amount: number };

export const feeService = {
  // ---------- Shared helpers ----------
  // Resolve all active students of a class (directly via classId, or via one of
  // the class's arms). Dedupes students that match both conditions.
  getStudentsInClass: async (tenantId: string, className: string) => {
    const cls = await prisma.class.findFirst({
      where: { name: className, schoolId: tenantId },
      select: { id: true },
    });
    if (!cls) return [];

    const arms = await prisma.arm.findMany({
      where: { classId: cls.id, schoolId: tenantId },
      select: { id: true },
    });

    const students = await prisma.student.findMany({
      where: {
        schoolId: tenantId,
        isActive: true,
        OR: [
          { classId: cls.id },
          ...(arms.length > 0 ? [{ armId: { in: arms.map(a => a.id) } }] : []),
        ],
      },
      select: { id: true },
    });

    return Array.from(new Map(students.map(s => [s.id, s])).values());
  },

  // ---------- Fee Structures ----------
  getAllFeeStructures: async () => {
    return prisma.feeStructure.findMany({
      orderBy: [{ className: 'asc' }, { term: 'asc' }],
    }); // middleware adds schoolId
  },

  createFeeStructure: async (data: {
    className: string;
    term: string;
    breakdown: BreakdownItem[];
    deadline: Date;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const cls = await prisma.class.findFirst({
      where: { name: data.className, schoolId: tenantId },
      select: { id: true },
    });
    if (!cls) throw new Error(`Class "${data.className}" not found`);

    const students = await feeService.getStudentsInClass(tenantId, data.className);

    // The breakdown amounts are per student. The fee structure's totalAmount
    // represents the expected class-wide total: per-student fee x student count.
    const perStudentAmount = data.breakdown.reduce((sum, item) => sum + item.amount, 0);
    const totalAmount = perStudentAmount * students.length;

    const feeStructure = await prisma.feeStructure.create({
      data: {
        className: data.className,
        term: data.term,
        breakdown: data.breakdown as Prisma.JsonArray,
        totalAmount,
        deadline: data.deadline,
        schoolId: tenantId,
      },
    });

    if (students.length > 0) {
      const studentFeeData = students.map(student => ({
        studentId: student.id,
        feeStructureId: feeStructure.id,
        amountAssigned: perStudentAmount,
        amountPaid: 0,
        status: 'PENDING' as const,
        schoolId: tenantId,
      }));

      await prisma.studentFee.createMany({
        data: studentFeeData,
      });
    }

    return feeStructure;
  },

  updateFeeStructure: async (
    id: string,
    data: Partial<{
      className: string;
      term: string;
      breakdown: BreakdownItem[];
      deadline: Date;
    }>
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const existing = await prisma.feeStructure.findUnique({
      where: { id, schoolId: tenantId },
    });
    if (!existing) throw new Error('Fee structure not found');

    // Per-student fee is the sum of the breakdown items; the class-wide total
    // is that fee multiplied by the number of students in the class.
    const className = data.className ?? existing.className;
    const students = await feeService.getStudentsInClass(tenantId, className);

    let perStudentAmount: number | undefined;
    let totalAmount: number | undefined;
    if (data.breakdown) {
      perStudentAmount = data.breakdown.reduce((sum, item) => sum + item.amount, 0);
      totalAmount = perStudentAmount * students.length;
    }

    const updateData: any = { ...data };
    if (data.breakdown) updateData.breakdown = data.breakdown as Prisma.JsonArray;
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;

    const updated = await prisma.feeStructure.update({
      where: { id, schoolId: tenantId },
      data: updateData,
    });

    // If the per-student fee changed, update the amount assigned to every
    // student that already has this fee.
    if (perStudentAmount !== undefined) {
      await prisma.studentFee.updateMany({
        where: { feeStructureId: id, schoolId: tenantId },
        data: { amountAssigned: perStudentAmount },
      });
    }

    // Backfill: make sure every student currently in the class has this fee
    // assigned (covers students enrolled after the fee was created).
    await feeService.assignFeeToMissingStudents(tenantId, updated, perStudentAmount);

    return updated;
  },

  assignFeeToMissingStudents: async (tenantId: string, feeStructure: {
    id: string;
    className: string;
    breakdown?: unknown;
    totalAmount: number;
  }, perStudentAmountOverride?: number) => {
    const students = await feeService.getStudentsInClass(tenantId, feeStructure.className);
    if (students.length === 0) return 0;

    const existing = await prisma.studentFee.findMany({
      where: {
        feeStructureId: feeStructure.id,
        studentId: { in: students.map(s => s.id) },
        schoolId: tenantId,
      },
      select: { studentId: true },
    });
    const existingIds = new Set(existing.map(e => e.studentId));

    const missing = students.filter(s => !existingIds.has(s.id));
    if (missing.length === 0) return 0;

    // Per-student amount: explicit override, else derive from the breakdown,
    // else fall back to totalAmount divided by the current student count.
    const perStudentAmount =
      perStudentAmountOverride ??
      (Array.isArray(feeStructure.breakdown)
        ? (feeStructure.breakdown as { amount: number }[]).reduce((sum, item) => sum + item.amount, 0)
        : feeStructure.totalAmount / students.length);

    await prisma.studentFee.createMany({
      data: missing.map(student => ({
        studentId: student.id,
        feeStructureId: feeStructure.id,
        amountAssigned: perStudentAmount,
        amountPaid: 0,
        status: 'PENDING' as const,
        schoolId: tenantId,
      })),
    });

    return missing.length;
  },

  deleteFeeStructure: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    await prisma.studentFee.deleteMany({
      where: { feeStructureId: id, schoolId: tenantId },
    });
    await prisma.feePayment.deleteMany({
      where: { feeStructureId: id, schoolId: tenantId },
    });
    return prisma.feeStructure.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // ---------- Payments ----------
  getAllPayments: async (filters?: {
    studentId?: string;
    classId?: string;
    page?: number;
    limit?: number;
  }) => {
    const where: any = {};
    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.classId) {
      // Ensure students belong to the tenant (middleware on FeePayment already scopes)
      // but we also need to filter students by class; the middleware will add schoolId to FeePayment.
      const students = await prisma.student.findMany({
        where: { classId: filters.classId },
        select: { id: true },
      });
      where.studentId = { in: students.map(s => s.id) };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const payments = await prisma.feePayment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            admissionNumber: true,
            class: { select: { name: true } },
            parent: { select: { name: true, email: true, phone: true } },
          },
        },
        feeStructure: true,
      },
      orderBy: { paymentDate: 'desc' },
      skip,
      take: limit,
    }); // middleware adds schoolId to where

    return payments;
  },

  recordPayment: async (data: {
    studentId: string;
    feeStructureId: string;
    amountPaid: number;
    paymentMethod: string;
    reference?: string;
    breakdownItems: PaymentBreakdownItem[];
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const totalFromItems = data.breakdownItems.reduce((sum, i) => sum + i.amount, 0);
    if (totalFromItems !== data.amountPaid) {
      throw new Error('Sum of breakdown items must equal total amount paid');
    }

    let studentFee = await prisma.studentFee.findUnique({
      where: {
        studentId_feeStructureId: {
          studentId: data.studentId,
          feeStructureId: data.feeStructureId,
        },
      },
    });

    if (!studentFee) {
      const feeStructure = await prisma.feeStructure.findUnique({
        where: { id: data.feeStructureId, schoolId: tenantId },
      });
      if (!feeStructure) throw new Error('Fee structure not found');
      studentFee = await prisma.studentFee.create({
        data: {
          studentId: data.studentId,
          feeStructureId: data.feeStructureId,
          amountAssigned: Array.isArray(feeStructure.breakdown)
            ? (feeStructure.breakdown as { amount: number }[]).reduce((sum, item) => sum + item.amount, 0)
            : feeStructure.totalAmount,
          amountPaid: 0,
          status: 'PENDING',
          schoolId: tenantId,
        },
      });
    }

    const newAmountPaid = studentFee.amountPaid + data.amountPaid;
    let newStatus: 'PENDING' | 'PARTIAL' | 'PAID' = 'PARTIAL';
    if (newAmountPaid >= studentFee.amountAssigned) newStatus = 'PAID';
    else if (newAmountPaid === 0) newStatus = 'PENDING';
    else newStatus = 'PARTIAL';

    await prisma.studentFee.update({
      where: { id: studentFee.id, schoolId: tenantId },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    const payment = await prisma.feePayment.create({
      data: {
        studentId: data.studentId,
        feeStructureId: data.feeStructureId,
        amountPaid: data.amountPaid,
        paymentDate: new Date(),
        reference: data.reference || null,
        paymentMethod: data.paymentMethod,
        breakdownItems: data.breakdownItems as Prisma.JsonArray,
        status: newStatus === 'PAID' ? 'PAID' : newStatus === 'PARTIAL' ? 'PARTIAL' : 'PENDING',
        schoolId: tenantId,
      },
      include: {
        student: { select: { name: true, admissionNumber: true } },
        feeStructure: true,
      },
    });

    return payment;
  },

  // ---------- Messaging (real implementation) ----------
  sendMessage: async (
    studentId: string,
    type: 'email' | 'sms',
    subject: string | undefined,
    message: string
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const student = await prisma.student.findUnique({
      where: { id: studentId, schoolId: tenantId },
      include: { parent: true },
    });
    if (!student || !student.parent) {
      throw new Error('Student or parent not found');
    }

    if (type === 'email') {
      const email = student.parent.email;
      if (!email) throw new Error('Parent email not available');
      await sendEmail(email, subject || 'Fee Reminder', message);
      return { success: true, recipient: email, type };
    } else if (type === 'sms') {
      const phone = student.parent.phone;
      if (!phone) throw new Error('Parent phone not available');
      await sendSMS(phone, message);
      return { success: true, recipient: phone, type };
    } else {
      throw new Error('Invalid message type');
    }
  },

  // Get assigned fees for a student (with detailed status)
  getStudentAssignedFees: async (studentId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.studentFee.findMany({
      where: { studentId, schoolId: tenantId },
      include: { feeStructure: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};