import { Request, Response } from 'express';
import { armService } from '../services/armService';
import { subjectService } from '../services/subjectService';
import { skillService } from '../services/skillService'; // optional if you need to validate skill existence
import { createArmSchema, updateArmSchema } from '../validations/armValidation';
import { getStringParam } from '../utils/paramUtils';
import { z } from 'zod';

const addSubjectSchema = z.object({
  subjectId: z.string().optional(),
  name: z.string().optional(),
  teacherId: z.string().optional(),
});

const addSkillSchema = z.object({
  skillId: z.string(),
});

// Schema for updating the teacher of an arm-subject
const updateArmSubjectTeacherSchema = z.object({
  teacherId: z.string().nullable().optional(),
});

export const armController = {
  // ---------- Existing methods ----------
  getByClassId: async (req: Request, res: Response) => {
    const classId = getStringParam(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });
    const arms = await armService.getByClassId(classId);
    res.json(arms);
  },

  getById: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const arm = await armService.getById(id);
      if (!arm) return res.status(404).json({ error: 'Arm not found' });
      res.json(arm);
    } catch (err: any) {
      console.error('Get arm by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch arm' });
    }
  },

  // NEW: Get all arms (with class relation) – used for teacher management
  getAll: async (req: Request, res: Response) => {
    try {
      const arms = await armService.getAll();
      res.json(arms);
    } catch (err: any) {
      console.error('Get all arms error:', err);
      res.status(500).json({ error: 'Failed to fetch arms' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const data = createArmSchema.parse(req.body);
      const arm = await armService.create(data);
      res.status(201).json(arm);
    } catch (err: any) {
      console.error('Create arm error:', err);
      res.status(400).json({ error: err.message });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateArmSchema.parse(req.body);
      const updated = await armService.update(id, data);
      if (!updated) return res.status(404).json({ error: 'Arm not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update arm error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update arm' });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const deleted = await armService.delete(id);
      if (!deleted) return res.status(404).json({ error: 'Arm not found' });
      res.json({ message: 'Arm deleted' });
    } catch (err: any) {
      console.error('Delete arm error:', err);
      res.status(500).json({ error: 'Failed to delete arm' });
    }
  },

  // ---------- Subject assignment endpoints ----------
  getArmSubjects: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const subjects = await armService.getArmSubjects(armId);
      res.json(subjects);
    } catch (err: any) {
      console.error('Get arm subjects error:', err);
      res.status(500).json({ error: 'Failed to fetch arm subjects' });
    }
  },

  // NEW: Simplified subject list for results page (just { id, name })
  getArmSubjectsList: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const subjects = await armService.getSubjectsByArmId(armId);
      res.json(subjects);
    } catch (err: any) {
      console.error('Get arm subjects list error:', err);
      res.status(500).json({ error: 'Failed to fetch subjects for arm' });
    }
  },

  // NEW: Get students in an arm (for results page)
  getArmStudents: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const students = await armService.getStudentsByArmId(armId);
      res.json(students);
    } catch (err: any) {
      console.error('Get arm students error:', err);
      res.status(500).json({ error: 'Failed to fetch students for arm' });
    }
  },

  addSubjectToArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const { subjectId, name, teacherId } = addSubjectSchema.parse(req.body);
      let finalSubjectId = subjectId;
      if (!finalSubjectId) {
        if (!name) return res.status(400).json({ error: 'Subject name is required when creating a new subject' });
        const newSubject = await subjectService.create(name, undefined);
        finalSubjectId = newSubject.id;
      } else {
        const existing = await subjectService.getById(subjectId);
        if (!existing) return res.status(404).json({ error: 'Subject not found' });
      }
      const link = await armService.addSubjectToArm(armId, finalSubjectId, teacherId);
      res.status(201).json(link);
    } catch (err: any) {
      console.error('Add subject to arm error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to add subject to arm' });
    }
  },

  updateArmSubjectTeacher: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    const subjectId = getStringParam(req.params.subjectId);
    if (!armId || !subjectId) return res.status(400).json({ error: 'Invalid armId or subjectId' });
    try {
      const { teacherId } = updateArmSubjectTeacherSchema.parse(req.body);
      const updated = await armService.updateArmSubjectTeacher(armId, subjectId, teacherId ?? undefined);
      if (!updated) return res.status(404).json({ error: 'Arm-subject relation not found' });
      res.json(updated);
    } catch (err: any) {
      console.error('Update arm subject teacher error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  },

  removeArmSubject: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    const subjectId = getStringParam(req.params.subjectId);
    if (!armId || !subjectId) return res.status(400).json({ error: 'Invalid armId or subjectId' });
    try {
      const result = await armService.removeArmSubject(armId, subjectId);
      if (!result) return res.status(404).json({ error: 'Arm-subject relation not found' });
      res.json({ message: 'Subject removed from arm' });
    } catch (err: any) {
      console.error('Remove arm subject error:', err);
      res.status(500).json({ error: 'Failed to remove subject from arm' });
    }
  },

  // NEW: Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
  deleteSubjectArm: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await armService.deleteSubjectArm(id);
      res.json({ message: 'Subject assignment removed' });
    } catch (err: any) {
      console.error('Delete subject arm error:', err);
      res.status(500).json({ error: 'Failed to delete subject assignment' });
    }
  },

  // ---------- Skill assignment endpoints ----------
  addSkillToArm: async (req: Request, res: Response) => {
    const armId = getStringParam(req.params.armId);
    if (!armId) return res.status(400).json({ error: 'Invalid armId' });
    try {
      const { skillId } = addSkillSchema.parse(req.body);
      // Optional: verify skill exists
      // const skillExists = await skillService.getById(skillId);
      // if (!skillExists) return res.status(404).json({ error: 'Skill not found' });
      const link = await armService.addSkillToArm(armId, skillId);
      res.status(201).json(link);
    } catch (err: any) {
      console.error('Add skill to arm error:', err);
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: 'Failed to add skill to arm' });
    }
  },
};