import { Request, Response } from 'express';
import { promotionService } from '../services/promotionService';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const promoteSchema = z.object({
  sourceArmId: z.string(),
  targetArmId: z.string(),
  studentIds: z.array(z.string()).optional(),
  academicYearId: z.string().optional(),
  termId: z.string().optional(),
});

const bulkPromoteSchema = z.object({
  flow: z
    .array(
      z.object({
        fromArmId: z.string(),
        toArmId: z.string(),
        omitStudentIds: z.array(z.string()).optional(),
      })
    )
    .min(1),
  academicYearId: z.string(),
  termId: z.string(),
});

export const promotionController = {
  bulkPromote: async (req: Request, res: Response) => {
    try {
      const { flow, academicYearId, termId } = bulkPromoteSchema.parse(req.body);
      const result = await promotionService.bulkPromoteStudents(flow, academicYearId, termId);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(400).json({ error: err.message || 'Bulk promotion failed' });
    }
  },
  promote: async (req: Request, res: Response) => {
    try {
      const { sourceArmId, targetArmId, studentIds, academicYearId, termId } = promoteSchema.parse(req.body);
      const result = await promotionService.promoteStudents(sourceArmId, targetArmId, studentIds, academicYearId, termId);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Promotion failed' });
    }
  },
};