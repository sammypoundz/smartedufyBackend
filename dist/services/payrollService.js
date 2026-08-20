"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payrollService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.payrollService = {
    getAllPayroll: async () => {
        const payroll = await db_1.default.payroll.findMany({
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
    getStaffForPayroll: async (roles) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const users = await db_1.default.user.findMany({
            where: {
                role: { in: roles },
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
    createPayroll: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const existing = await db_1.default.payroll.findFirst({
            where: {
                staffId: data.staffId,
                month: data.month,
                schoolId: tenantId,
            },
        });
        if (existing) {
            throw new Error(`Payroll for this staff in ${data.month} already exists. Use update instead.`);
        }
        const created = await db_1.default.payroll.create({
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
    updatePayroll: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updateData = { ...data };
        if (data.status === 'PAID' && !updateData.paymentDate) {
            updateData.paymentDate = new Date();
        }
        const updated = await db_1.default.payroll.update({
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
    deletePayroll: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.payroll.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
