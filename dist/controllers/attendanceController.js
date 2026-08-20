"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceController = void 0;
const attendanceService_1 = require("../services/attendanceService");
const attendanceValidation_1 = require("../validations/attendanceValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const saveAttendanceSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    records: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string(),
        present: zod_1.z.boolean(),
    })),
});
exports.attendanceController = {
    /**
     * GET /attendance/student/:studentId
     * Returns all attendance records for a specific student:
     * [{ date: string, present: boolean }]
     */
    getByStudentId: async (req, res) => {
        const studentId = (0, paramUtils_1.getStringParam)(req.params.studentId);
        if (!studentId)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const records = await attendanceService_1.attendanceService.getByStudentId(studentId);
            // Transform dates to ISO string format YYYY-MM-DD
            const formatted = records.map(record => ({
                date: record.date.toISOString().split('T')[0],
                present: record.present,
            }));
            res.json(formatted);
        }
        catch (err) {
            console.error('Get student attendance error:', err);
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
    /**
     * GET /attendance/arm/:armId
     * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
     * Returns flat list: [{ studentId, date, present }]
     */
    getByArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        const startDateParam = req.query.startDate;
        const endDateParam = req.query.endDate;
        let startDate;
        let endDate;
        if (startDateParam) {
            startDate = new Date(startDateParam);
            if (isNaN(startDate.getTime())) {
                return res.status(400).json({ error: 'Invalid startDate format' });
            }
        }
        if (endDateParam) {
            endDate = new Date(endDateParam);
            if (isNaN(endDate.getTime())) {
                return res.status(400).json({ error: 'Invalid endDate format' });
            }
        }
        try {
            const records = await attendanceService_1.attendanceService.getByArmAndDateRange(armId, startDate, endDate);
            // Transform to flat list with date as string
            const flatRecords = records.map(record => ({
                studentId: record.studentId,
                date: record.date.toISOString().split('T')[0],
                present: record.present,
            }));
            res.json(flatRecords);
        }
        catch (err) {
            console.error('Get attendance error:', err);
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
    /**
     * POST /attendance/arm/:armId
     * Body: { date: string, records: [{ studentId, present }] }
     * Upserts attendance for the given arm and date.
     */
    saveAttendance: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const { date, records } = saveAttendanceSchema.parse(req.body);
            const saved = await attendanceService_1.attendanceService.saveBulkForArm(armId, new Date(date), records);
            res.status(201).json(saved);
        }
        catch (err) {
            console.error('Save attendance error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to save attendance' });
        }
    },
    /**
     * Legacy endpoint: POST /attendance/mark
     * Body: { date: string, records: [{ studentId, present }] }
     * (Assumes studentId already belongs to an arm; kept for backward compatibility)
     */
    mark: async (req, res) => {
        try {
            const { date, records } = attendanceValidation_1.markAttendanceSchema.parse(req.body);
            const created = await attendanceService_1.attendanceService.markBulk(new Date(date), records);
            res.status(201).json(created);
        }
        catch (err) {
            console.error('Mark attendance error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to mark attendance' });
        }
    },
};
