"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAttendanceSchema = void 0;
const zod_1 = require("zod");
exports.markAttendanceSchema = zod_1.z.object({
    date: zod_1.z.string().datetime(),
    records: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string(),
        present: zod_1.z.boolean(),
    })),
});
