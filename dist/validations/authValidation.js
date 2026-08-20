"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN']),
    name: zod_1.z.string(),
    schoolId: zod_1.z.string().min(1, 'School ID is required'), // Required for registration – user is assigned to a school
    gender: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
    // ❌ No schoolId – the backend derives it from the user record
});
