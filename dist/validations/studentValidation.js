"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStudentSubjectsSchema = exports.createParentSchema = exports.updateStudentSchema = exports.createStudentSchema = exports.assignParentSchema = void 0;
const zod_1 = require("zod");
// ==================== Existing ====================
exports.assignParentSchema = zod_1.z.object({
    parentId: zod_1.z.string(),
});
exports.createStudentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    gender: zod_1.z.string().optional(),
    admissionNumber: zod_1.z.string().optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
});
// Extended update schema: now accepts personal, academic, and parent fields
exports.updateStudentSchema = zod_1.z.object({
    // Personal fields
    name: zod_1.z.string().min(1).optional(),
    gender: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(), // ISO date string
    address: zod_1.z.string().optional(),
    admissionNumber: zod_1.z.string().optional(),
    // Academic fields
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
    // Parent fields (mutually exclusive)
    parentId: zod_1.z.string().optional(),
    newParent: zod_1.z.object({
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
        phone: zod_1.z.string().optional(),
    }).optional(),
}).refine(data => !(data.parentId && data.newParent), {
    message: "Cannot provide both parentId and newParent",
});
// ==================== New for StudentBio ====================
exports.createParentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().optional(),
});
exports.updateStudentSubjectsSchema = zod_1.z.object({
    subjectIds: zod_1.z.array(zod_1.z.string()),
});
