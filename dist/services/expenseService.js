"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.expenseService = {
    getAll: async () => {
        return db_1.default.expense.findMany({
            orderBy: { date: 'desc' },
        }); // middleware adds schoolId to where
    },
    getById: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.expense.findUnique({
            where: { id, schoolId: tenantId },
        });
    },
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.expense.create({
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
        return db_1.default.expense.update({
            where: { id, schoolId: tenantId },
            data,
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.expense.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
