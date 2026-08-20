import { Request, Response } from 'express';
import { attendanceService } from '../services/attendanceService';
import { markAttendanceSchema } from '../validations/attendanceValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const saveAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    studentId: z.string(),
    present: z.boolean(),
  })),
});

export const attendanceController = {
  /**
   * GET /attendance/student/:studentId
   * Returns all attendance records for a specific student:
   * [{ date: string, present: boolean }]
   */
  getByStudentId: async (req: Request, res: Response) => {
    const studentId = getStringParam(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const records = await attendanceService.getByStudentId(studentId);
      // Transform dates to ISO string format YYYY-MM-DD
      const formatted = records.map(record => ({
        date: record.date.toISOString().split('T')[0],
        present: record.present,
      }));
      res.json(formatted);
    } catch (err: any) {
      console.error('Get student attendance error:', err);
      res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
  },

  /**
   * GET /attendance/arm/:armId
   * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
   * Returns flat list: [{ studentId, date, present }]
   */
  getByArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });

    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

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
      const records = await attendanceService.getByArmAndDateRange(armId, startDate, endDate);
      // Transform to flat list with date as string
      const flatRecords = records.map(record => ({
        studentId: record.studentId,
        date: record.date.toISOString().split('T')[0],
        present: record.present,
      }));
      res.json(flatRecords);
    } catch (err: any) {
      console.error('Get attendance error:', err);
      res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
  },

  /**
   * POST /attendance/arm/:armId
   * Body: { date: string, records: [{ studentId, present }] }
   * Upserts attendance for the given arm and date.
   */
  saveAttendance: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });

    try {
      const { date, records } = saveAttendanceSchema.parse(req.body);
      const saved = await attendanceService.saveBulkForArm(armId, new Date(date), records);
      res.status(201).json(saved);
    } catch (err: any) {
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
  mark: async (req: Request, res: Response) => {
    try {
      const { date, records } = markAttendanceSchema.parse(req.body);
      const created = await attendanceService.markBulk(new Date(date), records);
      res.status(201).json(created);
    } catch (err: any) {
      console.error('Mark attendance error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to mark attendance' });
    }
  },
};