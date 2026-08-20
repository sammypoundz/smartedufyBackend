"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeService = void 0;
const db_1 = __importDefault(require("../config/db"));
const messaging_1 = require("../utils/messaging");
const tenantContext_1 = require("../utils/tenantContext");
exports.feeService = {
    // ---------- Fee Structures ----------
    getAllFeeStructures: async () => {
        return db_1.default.feeStructure.findMany({
            orderBy: [{ className: 'asc' }, { term: 'asc' }],
        }); // middleware adds schoolId
    },
    createFeeStructure: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const totalAmount = data.breakdown.reduce((sum, item) => sum + item.amount, 0);
        const feeStructure = await db_1.default.feeStructure.create({
            data: {
                className: data.className,
                term: data.term,
                breakdown: data.breakdown,
                totalAmount,
                deadline: data.deadline,
                schoolId: tenantId,
            },
        });
        // Find students belonging to this tenant and class
        const students = await db_1.default.student.findMany({
            where: {
                class: { name: data.className },
                schoolId: tenantId,
            },
            select: { id: true },
        });
        if (students.length > 0) {
            const studentFeeData = students.map(student => ({
                studentId: student.id,
                feeStructureId: feeStructure.id,
                amountAssigned: totalAmount,
                amountPaid: 0,
                status: 'PENDING',
                schoolId: tenantId,
            }));
            await db_1.default.studentFee.createMany({
                data: studentFeeData,
            });
        }
        return feeStructure;
    },
    updateFeeStructure: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        let totalAmount;
        if (data.breakdown) {
            totalAmount = data.breakdown.reduce((sum, item) => sum + item.amount, 0);
        }
        const updateData = { ...data };
        if (data.breakdown)
            updateData.breakdown = data.breakdown;
        if (totalAmount !== undefined)
            updateData.totalAmount = totalAmount;
        return db_1.default.feeStructure.update({
            where: { id, schoolId: tenantId },
            data: updateData,
        });
    },
    deleteFeeStructure: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await db_1.default.studentFee.deleteMany({
            where: { feeStructureId: id, schoolId: tenantId },
        });
        await db_1.default.feePayment.deleteMany({
            where: { feeStructureId: id, schoolId: tenantId },
        });
        return db_1.default.feeStructure.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // ---------- Payments ----------
    getAllPayments: async (filters) => {
        const where = {};
        if (filters?.studentId)
            where.studentId = filters.studentId;
        if (filters?.classId) {
            // Ensure students belong to the tenant (middleware on FeePayment already scopes)
            // but we also need to filter students by class; the middleware will add schoolId to FeePayment.
            const students = await db_1.default.student.findMany({
                where: { classId: filters.classId },
                select: { id: true },
            });
            where.studentId = { in: students.map(s => s.id) };
        }
        const page = filters?.page || 1;
        const limit = filters?.limit || 50;
        const skip = (page - 1) * limit;
        const payments = await db_1.default.feePayment.findMany({
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
    recordPayment: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const totalFromItems = data.breakdownItems.reduce((sum, i) => sum + i.amount, 0);
        if (totalFromItems !== data.amountPaid) {
            throw new Error('Sum of breakdown items must equal total amount paid');
        }
        let studentFee = await db_1.default.studentFee.findUnique({
            where: {
                studentId_feeStructureId: {
                    studentId: data.studentId,
                    feeStructureId: data.feeStructureId,
                },
            },
        });
        if (!studentFee) {
            const feeStructure = await db_1.default.feeStructure.findUnique({
                where: { id: data.feeStructureId, schoolId: tenantId },
            });
            if (!feeStructure)
                throw new Error('Fee structure not found');
            studentFee = await db_1.default.studentFee.create({
                data: {
                    studentId: data.studentId,
                    feeStructureId: data.feeStructureId,
                    amountAssigned: feeStructure.totalAmount,
                    amountPaid: 0,
                    status: 'PENDING',
                    schoolId: tenantId,
                },
            });
        }
        const newAmountPaid = studentFee.amountPaid + data.amountPaid;
        let newStatus = 'PARTIAL';
        if (newAmountPaid >= studentFee.amountAssigned)
            newStatus = 'PAID';
        else if (newAmountPaid === 0)
            newStatus = 'PENDING';
        else
            newStatus = 'PARTIAL';
        await db_1.default.studentFee.update({
            where: { id: studentFee.id, schoolId: tenantId },
            data: {
                amountPaid: newAmountPaid,
                status: newStatus,
            },
        });
        const payment = await db_1.default.feePayment.create({
            data: {
                studentId: data.studentId,
                feeStructureId: data.feeStructureId,
                amountPaid: data.amountPaid,
                paymentDate: new Date(),
                reference: data.reference || null,
                paymentMethod: data.paymentMethod,
                breakdownItems: data.breakdownItems,
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
    sendMessage: async (studentId, type, subject, message) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const student = await db_1.default.student.findUnique({
            where: { id: studentId, schoolId: tenantId },
            include: { parent: true },
        });
        if (!student || !student.parent) {
            throw new Error('Student or parent not found');
        }
        if (type === 'email') {
            const email = student.parent.email;
            if (!email)
                throw new Error('Parent email not available');
            await (0, messaging_1.sendEmail)(email, subject || 'Fee Reminder', message);
            return { success: true, recipient: email, type };
        }
        else if (type === 'sms') {
            const phone = student.parent.phone;
            if (!phone)
                throw new Error('Parent phone not available');
            await (0, messaging_1.sendSMS)(phone, message);
            return { success: true, recipient: phone, type };
        }
        else {
            throw new Error('Invalid message type');
        }
    },
    // Get assigned fees for a student (with detailed status)
    getStudentAssignedFees: async (studentId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.studentFee.findMany({
            where: { studentId, schoolId: tenantId },
            include: { feeStructure: true },
            orderBy: { createdAt: 'desc' },
        });
    },
};
