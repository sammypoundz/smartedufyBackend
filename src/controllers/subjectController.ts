import { Request, Response } from 'express';
import { subjectService } from '../services/subjectService';
import { createSubjectSchema, updateSubjectSchema } from '../validations/subjectValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const addToArmSchema = z.object({
  subjectId: z.string().optional(),
  name: z.string().optional(),
  teacherId: z.string().optional(),
});

const updateArmSubjectSchema = z.object({
  teacherId: z.string().optional(),
});

// Schema for toggling topic completion
const updateTopicCompletionSchema = z.object({
  completed: z.boolean(),
});

// Schema for creating/updating a topic (full data)
const topicSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  completed: z.boolean().optional(),
});

export const subjectController = {
  // ---------- Global subject CRUD ----------
  getAll: async (req: Request, res: Response) => {
    try {
      const subjects = await subjectService.getAll();
      res.json(subjects);
    } catch (err: any) {
      console.error('Get all subjects error:', err);
      res.status(500).json({ error: 'Failed to fetch subjects' });
    }
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const subject = await subjectService.getById(id);
      if (!subject) return res.status(404).json({ error: 'Subject not found' });
      res.json(subject);
    } catch (err: any) {
      console.error('Get subject by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch subject' });
    }
  },

  // NEW: Get subject with arm‑specific teacher and class details (requires armId query param)
  getByIdWithArm: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const armId = getStringParam(req.query.armId as string);
    if (!subjectId || !armId) {
      return res.status(400).json({ error: 'Subject ID and arm ID are required' });
    }
    try {
      const subject = await subjectService.getByIdWithArm(subjectId, armId);
      if (!subject) return res.status(404).json({ error: 'Subject not found' });
      res.json(subject);
    } catch (err: any) {
      console.error('Get subject with arm error:', err);
      res.status(500).json({ error: 'Failed to fetch subject details' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { name, description } = createSubjectSchema.parse(req.body);
      const newSubject = await subjectService.create(name, description);
      res.status(201).json(newSubject);
    } catch (err: any) {
      console.error('Create subject error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create subject' });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const { name, description } = updateSubjectSchema.parse(req.body);
      const updated = await subjectService.update(id, name, description);
      if (!updated) return res.status(404).json({ error: 'Subject not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update subject error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update subject' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await subjectService.delete(id);
      res.json({ message: 'Subject deleted' });
    } catch (err: any) {
      console.error('Delete subject error:', err);
      res.status(500).json({ error: 'Failed to delete subject' });
    }
  },

  // ---------- Arm‑specific subject endpoints ----------
  getByArmId: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const subjects = await subjectService.getByArmId(armId);
      res.json(subjects);
    } catch (err: any) {
      console.error('Get subjects by arm error:', err);
      res.status(500).json({ error: 'Failed to fetch subjects for arm' });
    }
  },

  addToArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const { subjectId, name, teacherId } = addToArmSchema.parse(req.body);
      let subject;
      if (subjectId) {
        subject = await subjectService.getById(subjectId);
        if (!subject) return res.status(404).json({ error: 'Subject not found' });
      } else {
        if (!name) return res.status(400).json({ error: 'Subject name is required when creating a new subject' });
        subject = await subjectService.create(name, undefined);
      }
      const link = await subjectService.linkToArm(subject.id, armId, teacherId);
      res.status(201).json({ subject, link });
    } catch (err: any) {
      console.error('Add subject to arm error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to add subject to arm' });
    }
  },

  updateArmSubject: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const { teacherId } = updateArmSubjectSchema.parse(req.body);
      const updated = await subjectService.updateArmSubject(id, teacherId);
      if (!updated) return res.status(404).json({ error: 'Arm‑subject relation not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update arm‑subject error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update arm‑subject relation' });
    }
  },

  removeFromArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    const subjectId = getStringParam(req.params.subjectId);
    if (!armId || !subjectId) return res.status(400).json({ error: 'Invalid armId or subjectId' });
    try {
      await subjectService.removeFromArm(armId, subjectId);
      res.json({ message: 'Subject removed from arm' });
    } catch (err: any) {
      console.error('Remove subject from arm error:', err);
      res.status(500).json({ error: 'Failed to remove subject from arm' });
    }
  },

  // NEW: Delete a subject‑arm relation by its own ID (used for direct removal)
  deleteSubjectArm: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await subjectService.deleteSubjectArm(id);
      res.json({ message: 'Subject-arm relation deleted' });
    } catch (err: any) {
      console.error('Delete subject-arm error:', err);
      res.status(500).json({ error: 'Failed to delete subject-arm relation' });
    }
  },

  // ---------- Curriculum endpoints ----------
  getCurriculum: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const armId = getStringParam(req.query.armId as string);
    if (!subjectId || !armId) {
      return res.status(400).json({ error: 'Subject id and arm id are required' });
    }
    try {
      const topics = await subjectService.getCurriculum(subjectId, armId);
      res.json(topics);
    } catch (err: any) {
      console.error('Get curriculum error:', err);
      res.status(500).json({ error: 'Failed to fetch curriculum' });
    }
  },

  createCurriculum: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const armId = getStringParam(req.query.armId as string);
    if (!subjectId || !armId) {
      return res.status(400).json({ error: 'Subject id and arm id are required' });
    }
    try {
      const data = topicSchema.parse(req.body);
      const newTopic = await subjectService.createTopic(subjectId, armId, {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        completed: data.completed ?? false,
      });
      res.status(201).json(newTopic);
    } catch (err: any) {
      console.error('Create curriculum error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to create topic' });
    }
  },

  updateCurriculum: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const topicId = getStringParam(req.params.topicId);
    if (!subjectId || !topicId) {
      return res.status(400).json({ error: 'Invalid subject or topic id' });
    }
    try {
      const data = topicSchema.parse(req.body);
      const updated = await subjectService.updateTopic(topicId, {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        completed: data.completed,
      });
      if (!updated) return res.status(404).json({ error: 'Topic not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update curriculum error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update topic' });
    }
  },

  updateTopicCompletion: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const topicId = getStringParam(req.params.topicId);
    if (!subjectId || !topicId) return res.status(400).json({ error: 'Invalid subject or topic id' });
    try {
      const { completed } = updateTopicCompletionSchema.parse(req.body);
      const updated = await subjectService.updateTopicCompletion(subjectId, topicId, completed);
      if (!updated) return res.status(404).json({ error: 'Topic not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update topic completion error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update topic completion' });
    }
  },

  deleteCurriculum: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const topicId = getStringParam(req.params.topicId);
    if (!subjectId || !topicId) {
      return res.status(400).json({ error: 'Invalid subject or topic id' });
    }
    try {
      await subjectService.deleteTopic(topicId);
      res.json({ message: 'Topic deleted' });
    } catch (err: any) {
      console.error('Delete curriculum error:', err);
      res.status(500).json({ error: 'Failed to delete topic' });
    }
  },

  getPerformance: async (req: Request, res: Response) => {
    const subjectId = getStringParam(req.params.id);
    const armId = getStringParam(req.query.armId as string);
    if (!subjectId || !armId) {
      return res.status(400).json({ error: 'Subject id and arm id are required' });
    }
    try {
      const performance = await subjectService.getPerformance(subjectId, armId);
      res.json(performance || null);
    } catch (err: any) {
      console.error('Get performance error:', err);
      res.status(500).json({ error: 'Failed to fetch performance data' });
    }
  },
};