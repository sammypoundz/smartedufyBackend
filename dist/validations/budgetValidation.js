"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBudgetSchema = exports.createBudgetSchema = void 0;
const zod_1 = require("zod");
exports.createBudgetSchema = zod_1.z.object({
    category: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    monthYear: zod_1.z.string().regex(/^\d{4}-\d{2}$/, 'MonthYear must be in YYYY-MM format'),
});
exports.updateBudgetSchema = exports.createBudgetSchema.partial();
