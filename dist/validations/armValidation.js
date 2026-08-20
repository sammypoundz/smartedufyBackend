"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateArmSchema = exports.createArmSchema = void 0;
const zod_1 = require("zod");
exports.createArmSchema = zod_1.z.object({
    letter: zod_1.z.string().min(1),
    alias: zod_1.z.string().optional(),
    classId: zod_1.z.string(),
    teacherId: zod_1.z.string().optional(), // creation does not need null
});
exports.updateArmSchema = zod_1.z.object({
    alias: zod_1.z.string().optional(),
    teacherId: zod_1.z.string().nullable().optional(), // ✅ allows null to unassign a teacher
});
