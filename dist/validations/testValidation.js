"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTestSchema = exports.createTestSchema = void 0;
const zod_1 = require("zod");
exports.createTestSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    classId: zod_1.z.string(),
    armId: zod_1.z.string(),
    subjects: zod_1.z.array(zod_1.z.string()), // ✅ NEW: required array of subject IDs
    questionCount: zod_1.z.number().min(1).max(1000),
    duration: zod_1.z.number().min(1).max(300),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});
exports.updateTestSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
    subjects: zod_1.z.array(zod_1.z.string()).optional(), // ✅ NEW: optional array
    questionCount: zod_1.z.number().min(1).max(1000).optional(),
    duration: zod_1.z.number().min(1).max(300).optional(),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED']).optional(),
});
