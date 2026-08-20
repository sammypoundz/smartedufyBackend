"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timetableController = void 0;
const timetableService_1 = require("../services/timetableService");
const timetableValidation_1 = require("../validations/timetableValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const updateTimetableSchema = zod_1.z.object({
    dayOfWeek: zod_1.z.string().optional(),
    timeSlot: zod_1.z.string().optional(),
    subjectId: zod_1.z.string().optional(),
});
exports.timetableController = {
    // Get raw timetable entries for an arm (no grouping, includes subject details)
    getByArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const entries = await timetableService_1.timetableService.getByArmId(armId);
            // Return raw entries directly – frontend will build the grid from these
            res.json(entries);
        }
        catch (err) {
            console.error('Get timetable error:', err);
            res.status(500).json({ error: 'Failed to fetch timetable' });
        }
    },
    // Bulk replace the entire timetable for an arm
    replace: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const { entries } = timetableValidation_1.bulkTimetableSchema.parse(req.body);
            const result = await timetableService_1.timetableService.replaceForArm(armId, entries);
            res.status(201).json(result);
        }
        catch (err) {
            console.error('Replace timetable error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            // Detect teacher conflict (thrown by replaceForArm)
            if (err.message && err.message.includes('Teacher conflict')) {
                return res.status(409).json({ error: err.message });
            }
            res.status(500).json({ error: 'Failed to replace timetable' });
        }
    },
    // Update a single timetable entry
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = updateTimetableSchema.parse(req.body);
            const updated = await timetableService_1.timetableService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Timetable entry not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update timetable entry error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update timetable entry' });
        }
    },
    // Delete a single timetable entry
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await timetableService_1.timetableService.delete(id);
            res.json({ message: 'Timetable entry deleted' });
        }
        catch (err) {
            console.error('Delete timetable entry error:', err);
            res.status(500).json({ error: 'Failed to delete timetable entry' });
        }
    },
    // Get timetable for a teacher (based on subjects they teach)
    // Returns data in the format expected by the frontend TeacherProfile component
    getByTeacherId: async (req, res) => {
        const teacherId = (0, paramUtils_1.getStringParam)(req.params.teacherId);
        if (!teacherId)
            return res.status(400).json({ error: 'Invalid teacherId' });
        try {
            const entries = await timetableService_1.timetableService.getByTeacherId(teacherId);
            // Transform to frontend-expected shape:
            const transformed = entries.map((entry) => ({
                id: entry.id,
                dayOfWeek: entry.dayOfWeek,
                timeSlot: entry.timeSlot,
                subject: { name: entry.subject?.name || 'Unknown' },
                arm: {
                    letter: entry.arm?.letter || '',
                    class: entry.arm?.class ? { name: entry.arm.class.name } : undefined,
                },
            }));
            res.json(transformed);
        }
        catch (err) {
            console.error('Get timetable by teacher error:', err);
            res.status(500).json({ error: 'Failed to fetch teacher timetable' });
        }
    },
};
