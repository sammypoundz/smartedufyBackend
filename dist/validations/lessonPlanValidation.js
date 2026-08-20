"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLessonPlanSchema = exports.createLessonPlanSchema = void 0;
const zod_1 = require("zod");
exports.createLessonPlanSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    classId: zod_1.z.string(),
    armId: zod_1.z.string(),
    subjectId: zod_1.z.string(),
    status: zod_1.z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).default('DRAFT'),
});
exports.updateLessonPlanSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
    subjectId: zod_1.z.string().optional(),
    status: zod_1.z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
});
