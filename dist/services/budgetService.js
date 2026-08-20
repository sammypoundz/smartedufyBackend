"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.budgetService = {
    getAllBudgets: async () => {
        return db_1.default.budget.findMany({
            orderBy: [{ monthYear: 'desc' }, { category: 'asc' }],
        }); // middleware adds schoolId to where
    },
    createBudget: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Check if budget already exists for this category and month within this tenant
        const existing = await db_1.default.budget.findFirst({
            where: {
                category: data.category,
                monthYear: data.monthYear,
                schoolId: tenantId,
            },
        });
        if (existing) {
            throw new Error(`Budget for ${data.category} in ${data.monthYear} already exists. Use update instead.`);
        }
        return db_1.default.budget.create({
            data: {
                ...data,
                schoolId: tenantId,
            },
        });
    },
    updateBudget: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Fetch current budget (ensuring it belongs to the tenant)
        const current = await db_1.default.budget.findUnique({
            where: { id, schoolId: tenantId },
        });
        if (!current)
            throw new Error('Budget not found');
        // Determine new category and monthYear (fallback to current if not changed)
        const newCategory = data.category ?? current.category;
        const newMonthYear = data.monthYear ?? current.monthYear;
        // If category or monthYear changes, check for conflict with another budget within the tenant
        if (newCategory !== current.category || newMonthYear !== current.monthYear) {
            const conflict = await db_1.default.budget.findFirst({
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
        return db_1.default.budget.update({
            where: { id, schoolId: tenantId },
            data,
        });
    },
    deleteBudget: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.budget.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
