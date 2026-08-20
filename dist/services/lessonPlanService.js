"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonPlanService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.lessonPlanService = {
    // Get all lesson plans with optional filters (classId, armId, subjectId)
    getAll: async (filters) => {
        const where = {};
        if (filters?.classId)
            where.classId = filters.classId;
        if (filters?.armId)
            where.armId = filters.armId;
        if (filters?.subjectId)
            where.subjectId = filters.subjectId;
        // middleware adds schoolId to where automatically
        return db_1.default.lessonPlan.findMany({
            where,
            include: {
                class: { select: { name: true } },
                arm: { select: { letter: true } },
                subject: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },
    getById: (id) => db_1.default.lessonPlan.findUnique({
        where: { id }, // middleware adds schoolId
        include: {
            class: { select: { name: true } },
            arm: { select: { letter: true } },
            subject: { select: { name: true } },
        },
    }),
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.lessonPlan.create({
            data: {
                ...data,
                status: data.status || 'DRAFT',
                schoolId: tenantId,
            },
        });
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.lessonPlan.update({
            where: { id, schoolId: tenantId },
            data,
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Optionally delete the physical file? Currently not implemented.
        return db_1.default.lessonPlan.delete({
            where: { id, schoolId: tenantId },
        });
    },
    getFileInfo: (id) => db_1.default.lessonPlan.findUnique({
        where: { id }, // middleware adds schoolId
        select: { fileUrl: true, fileName: true, fileType: true },
    }),
};
