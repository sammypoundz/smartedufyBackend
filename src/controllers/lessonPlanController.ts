import { Request, Response } from 'express';
import { lessonPlanService } from '../services/lessonPlanService';
import { createLessonPlanSchema, updateLessonPlanSchema } from '../validations/lessonPlanValidation';
import { getStringParam } from '../utils/paramUtils';
import fs from 'fs/promises';
import path from 'path';

export const lessonPlanController = {
  // GET /lesson-plans?classId=&armId=&subjectId=
  getAll: async (req: Request, res: Response) => {
    try {
      const { classId, armId, subjectId } = req.query;
      const filters: any = {};
      if (classId && typeof classId === 'string') filters.classId = classId;
      if (armId && typeof armId === 'string') filters.armId = armId;
      if (subjectId && typeof subjectId === 'string') filters.subjectId = subjectId;

      const plans = await lessonPlanService.getAll(filters);
      // Transform to include readable names
      const transformed = plans.map((p: any) => ({
        ...p,
        className: p.class?.name,
        armLetter: p.arm?.letter,
        subjectName: p.subject?.name,
      }));
      res.json(transformed);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch lesson plans' });
    }
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const plan = await lessonPlanService.getById(id);
      if (!plan) return res.status(404).json({ error: 'Lesson plan not found' });
      const transformed = {
        ...plan,
        className: plan.class?.name,
        armLetter: plan.arm?.letter,
        subjectName: plan.subject?.name,
      };
      res.json(transformed);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch lesson plan' });
    }
  },

  // POST /lesson-plans (multipart/form-data)
  create: async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'File is required' });

      // Validate text fields
      const parsed = createLessonPlanSchema.parse({
        title: req.body.title,
        description: req.body.description,
        classId: req.body.classId,
        armId: req.body.armId,
        subjectId: req.body.subjectId,
        status: req.body.status,
      });

      const newPlan = await lessonPlanService.create({
        title: parsed.title,
        description: parsed.description,
        classId: parsed.classId,
        armId: parsed.armId,
        subjectId: parsed.subjectId,
        fileUrl: file.path,
        fileName: file.originalname,
        fileType: file.mimetype,
        status: parsed.status,
      });

      res.status(201).json(newPlan);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to create lesson plan' });
    }
  },

  // PUT /lesson-plans/:id (multipart/form-data, file optional)
  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const existing = await lessonPlanService.getById(id);
      if (!existing) return res.status(404).json({ error: 'Lesson plan not found' });

      // Validate text fields (optional)
      const parsed = updateLessonPlanSchema.parse({
        title: req.body.title,
        description: req.body.description,
        classId: req.body.classId,
        armId: req.body.armId,
        subjectId: req.body.subjectId,
        status: req.body.status,
      });

      const updateData: any = { ...parsed };
      const file = req.file;
      if (file) {
        // Delete old file if exists
        if (existing.fileUrl) {
          await fs.unlink(existing.fileUrl).catch(() => {});
        }
        updateData.fileUrl = file.path;
        updateData.fileName = file.originalname;
        updateData.fileType = file.mimetype;
      }

      const updated = await lessonPlanService.update(id, updateData);
      res.json(updated);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: 'Failed to update lesson plan' });
    }
  },

  // DELETE /lesson-plans/:id
  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const existing = await lessonPlanService.getById(id);
      if (!existing) return res.status(404).json({ error: 'Lesson plan not found' });
      if (existing.fileUrl) {
        await fs.unlink(existing.fileUrl).catch(() => {});
      }
      await lessonPlanService.delete(id);
      res.json({ message: 'Lesson plan deleted' });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete lesson plan' });
    }
  },

  // GET /lesson-plans/:id/download
  download: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const info = await lessonPlanService.getFileInfo(id);
      if (!info) return res.status(404).json({ error: 'File not found' });
      const filePath = path.resolve(info.fileUrl);
      res.download(filePath, info.fileName);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  },
};