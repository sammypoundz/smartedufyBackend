"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageSchema = exports.updatePaymentSchema = exports.recordPaymentSchema = exports.updateFeeStructureSchema = exports.createFeeStructureSchema = void 0;
const zod_1 = require("zod");
// Breakdown item schema
const breakdownItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    amount: zod_1.z.number().min(0),
});
// Fee structure creation / update
exports.createFeeStructureSchema = zod_1.z.object({
    className: zod_1.z.string().min(1),
    armName: zod_1.z.string().min(1).nullable().optional(),
    term: zod_1.z.string().min(1),
    breakdown: zod_1.z.array(breakdownItemSchema).min(1),
    deadline: zod_1.z.string().datetime(), // ISO date string
});
exports.updateFeeStructureSchema = exports.createFeeStructureSchema.partial();
// Payment record (itemised)
exports.recordPaymentSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    feeStructureId: zod_1.z.string().min(1),
    amountPaid: zod_1.z.number().positive(),
    paymentMethod: zod_1.z.enum(['cash', 'bank_transfer', 'card', 'cheque']),
    reference: zod_1.z.string().optional(),
    breakdownItems: zod_1.z.array(zod_1.z.object({
        itemName: zod_1.z.string(),
        amount: zod_1.z.number().positive(),
    })).min(1),
});
// Edit an existing payment (corrections / mistakes).
// Items may have amount 0 — that means the fee item is unmarked as paid.
// If ALL items are 0 the whole payment is removed (fully unmarked).
exports.updatePaymentSchema = zod_1.z.object({
    amountPaid: zod_1.z.number().min(0),
    paymentMethod: zod_1.z.enum(['cash', 'bank_transfer', 'card', 'cheque']),
    reference: zod_1.z.string().optional(),
    breakdownItems: zod_1.z.array(zod_1.z.object({
        itemName: zod_1.z.string(),
        amount: zod_1.z.number().min(0),
    })).min(1),
});
// Message sending
exports.sendMessageSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    type: zod_1.z.enum(['email', 'sms']),
    subject: zod_1.z.string().optional(), // for email
    message: zod_1.z.string().min(1),
});
