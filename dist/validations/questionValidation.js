"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateQuestionSchema = exports.createQuestionSchema = void 0;
const zod_1 = require("zod");
exports.createQuestionSchema = zod_1.z.object({
    testId: zod_1.z.string(),
    subjectId: zod_1.z.string().nullable().optional(),
    text: zod_1.z.string().min(1),
    options: zod_1.z.array(zod_1.z.string()).min(2).max(6),
    correctOption: zod_1.z.number().int().min(0),
    marks: zod_1.z.number().int().min(1).default(1),
    attachmentType: zod_1.z.enum(['image', 'video', 'audio']).nullable().optional(),
    attachmentUrl: zod_1.z.string().nullable().optional(),
});
exports.updateQuestionSchema = zod_1.z.object({
    subjectId: zod_1.z.string().nullable().optional(),
    text: zod_1.z.string().min(1).optional(),
    options: zod_1.z.array(zod_1.z.string()).min(2).max(6).optional(),
    correctOption: zod_1.z.number().int().min(0).optional(),
    marks: zod_1.z.number().int().min(1).optional(),
    attachmentType: zod_1.z.enum(['image', 'video', 'audio']).nullable().optional(),
    attachmentUrl: zod_1.z.string().nullable().optional(),
});
