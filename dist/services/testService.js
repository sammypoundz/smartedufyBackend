"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.testService = {
    getAll: (filters) => {
        const where = {};
        if (filters?.armId)
            where.armId = filters.armId;
        if (filters?.status)
            where.status = filters.status;
        // middleware adds schoolId automatically
        return db_1.default.test.findMany({
            where,
            include: { class: true, arm: true },
            orderBy: { createdAt: 'desc' },
        });
    },
    getById: (id) => db_1.default.test.findUnique({
        where: { id }, // middleware adds schoolId
        include: { class: true, arm: true, questions: true },
    }),
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.test.create({
            data: {
                ...data,
                schoolId: tenantId,
            },
        });
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.test.update({
            where: { id, schoolId: tenantId },
            data,
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // 1. Delete all questions belonging to this test (scoped by tenant)
        await db_1.default.question.deleteMany({
            where: { testId: id, schoolId: tenantId },
        });
        // 2. Then delete the test itself
        return db_1.default.test.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
