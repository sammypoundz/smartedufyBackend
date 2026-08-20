"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatusSchema = exports.updateUserSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']),
    isActive: zod_1.z.boolean().default(true),
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    role: zod_1.z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']).optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.updateStatusSchema = zod_1.z.object({
    isActive: zod_1.z.boolean(),
});
