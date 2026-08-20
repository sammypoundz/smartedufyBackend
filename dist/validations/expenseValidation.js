"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpenseSchema = exports.createExpenseSchema = void 0;
const zod_1 = require("zod");
exports.createExpenseSchema = zod_1.z.object({
    description: zod_1.z.string().min(1, 'Description is required'),
    amount: zod_1.z.number().positive('Amount must be positive'),
    category: zod_1.z.string().min(1, 'Category is required'),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});
exports.updateExpenseSchema = exports.createExpenseSchema.partial();
