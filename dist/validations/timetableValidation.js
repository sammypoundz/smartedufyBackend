"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeSlotsSchema = exports.bulkTimetableSchema = void 0;
const zod_1 = require("zod");
exports.bulkTimetableSchema = zod_1.z.object({
    entries: zod_1.z.array(zod_1.z.object({
        dayOfWeek: zod_1.z.string(),
        timeSlot: zod_1.z.string(),
        subjectId: zod_1.z.string().optional(),
    })),
});
// Ordered time slot layout for an arm ("Break"/"Lunch"/"Recess" slots are
// treated as non-instructional breaks by the service).
exports.timeSlotsSchema = zod_1.z.object({
    timeSlots: zod_1.z
        .array(zod_1.z.string().trim().min(1).max(60))
        .max(20, 'Too many time slots (max 20)'),
});
