import { Request, Response } from 'express';
import { timetableService } from '../services/timetableService';
import { bulkTimetableSchema } from '../validations/timetableValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const updateTimetableSchema = z.object({
  dayOfWeek: z.string().optional(),
  timeSlot: z.string().optional(),
  subjectId: z.string().optional(),
});

export const timetableController = {
  // Get raw timetable entries for an arm (no grouping, includes subject details)
  getByArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const entries = await timetableService.getByArmId(armId);
      // Return raw entries directly – frontend will build the grid from these
      res.json(entries);
    } catch (err: any) {
      console.error('Get timetable error:', err);
      res.status(500).json({ error: 'Failed to fetch timetable' });
    }
  },

  // Bulk replace the entire timetable for an arm
  replace: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const { entries } = bulkTimetableSchema.parse(req.body);
      const result = await timetableService.replaceForArm(armId, entries);
      res.status(201).json(result);
    } catch (err: any) {
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
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateTimetableSchema.parse(req.body);
      const updated = await timetableService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Timetable entry not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update timetable entry error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update timetable entry' });
    }
  },

  // Delete a single timetable entry
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await timetableService.delete(id);
      res.json({ message: 'Timetable entry deleted' });
    } catch (err: any) {
      console.error('Delete timetable entry error:', err);
      res.status(500).json({ error: 'Failed to delete timetable entry' });
    }
  },

  // Get timetable for a teacher (based on subjects they teach)
  // Returns data in the format expected by the frontend TeacherProfile component
  getByTeacherId: async (req: Request, res: Response) => {
    const teacherId = getStringParam(req.params.teacherId);
    if (!teacherId) return res.status(400).json({ error: 'Invalid teacherId' });
    try {
      const entries = await timetableService.getByTeacherId(teacherId);
      // Transform to frontend-expected shape:
      const transformed = entries.map((entry: any) => ({
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
    } catch (err: any) {
      console.error('Get timetable by teacher error:', err);
      res.status(500).json({ error: 'Failed to fetch teacher timetable' });
    }
  },
};