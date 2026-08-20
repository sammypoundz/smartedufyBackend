"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSkillSchema = exports.createSkillSchema = void 0;
const zod_1 = require("zod");
exports.createSkillSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
exports.updateSkillSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
});
