"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePayrollSchema = exports.createPayrollSchema = void 0;
const zod_1 = require("zod");
exports.createPayrollSchema = zod_1.z.object({
    staffId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    month: zod_1.z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    status: zod_1.z.enum(['PAID', 'PENDING', 'OVERDUE']).default('PENDING'),
    notes: zod_1.z.string().optional(),
});
exports.updatePayrollSchema = exports.createPayrollSchema.partial();
