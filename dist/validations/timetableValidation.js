"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkTimetableSchema = void 0;
const zod_1 = require("zod");
exports.bulkTimetableSchema = zod_1.z.object({
    entries: zod_1.z.array(zod_1.z.object({
        dayOfWeek: zod_1.z.string(),
        timeSlot: zod_1.z.string(),
        subjectId: zod_1.z.string().optional(),
    })),
});
