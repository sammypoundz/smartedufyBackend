"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.armController = void 0;
const armService_1 = require("../services/armService");
const subjectService_1 = require("../services/subjectService");
const armValidation_1 = require("../validations/armValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const addSubjectSchema = zod_1.z.object({
    subjectId: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    teacherId: zod_1.z.string().optional(),
});
const addSkillSchema = zod_1.z.object({
    skillId: zod_1.z.string(),
});
// Schema for updating the teacher of an arm-subject
const updateArmSubjectTeacherSchema = zod_1.z.object({
    teacherId: zod_1.z.string().nullable().optional(),
});
exports.armController = {
    // ---------- Existing methods ----------
    getByClassId: async (req, res) => {
        const classId = (0, paramUtils_1.getStringParam)(req.params.classId);
        if (!classId)
            return res.status(400).json({ error: 'Invalid classId' });
        const arms = await armService_1.armService.getByClassId(classId);
        res.json(arms);
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const arm = await armService_1.armService.getById(id);
            if (!arm)
                return res.status(404).json({ error: 'Arm not found' });
            res.json(arm);
        }
        catch (err) {
            console.error('Get arm by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch arm' });
        }
    },
    // NEW: Get all arms (with class relation) – used for teacher management
    getAll: async (req, res) => {
        try {
            const arms = await armService_1.armService.getAll();
            res.json(arms);
        }
        catch (err) {
            console.error('Get all arms error:', err);
            res.status(500).json({ error: 'Failed to fetch arms' });
        }
    },
    create: async (req, res) => {
        try {
            const data = armValidation_1.createArmSchema.parse(req.body);
            const arm = await armService_1.armService.create(data);
            res.status(201).json(arm);
        }
        catch (err) {
            console.error('Create arm error:', err);
            res.status(400).json({ error: err.message });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = armValidation_1.updateArmSchema.parse(req.body);
            const updated = await armService_1.armService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Arm not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update arm error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update arm' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const deleted = await armService_1.armService.delete(id);
            if (!deleted)
                return res.status(404).json({ error: 'Arm not found' });
            res.json({ message: 'Arm deleted' });
        }
        catch (err) {
            console.error('Delete arm error:', err);
            res.status(500).json({ error: 'Failed to delete arm' });
        }
    },
    // ---------- Subject assignment endpoints ----------
    getArmSubjects: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const subjects = await armService_1.armService.getArmSubjects(armId);
            res.json(subjects);
        }
        catch (err) {
            console.error('Get arm subjects error:', err);
            res.status(500).json({ error: 'Failed to fetch arm subjects' });
        }
    },
    // NEW: Simplified subject list for results page (just { id, name })
    getArmSubjectsList: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const subjects = await armService_1.armService.getSubjectsByArmId(armId);
            res.json(subjects);
        }
        catch (err) {
            console.error('Get arm subjects list error:', err);
            res.status(500).json({ error: 'Failed to fetch subjects for arm' });
        }
    },
    // NEW: Get students in an arm (for results page)
    getArmStudents: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const students = await armService_1.armService.getStudentsByArmId(armId);
            res.json(students);
        }
        catch (err) {
            console.error('Get arm students error:', err);
            res.status(500).json({ error: 'Failed to fetch students for arm' });
        }
    },
    addSubjectToArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const { subjectId, name, teacherId } = addSubjectSchema.parse(req.body);
            let finalSubjectId = subjectId;
            if (!finalSubjectId) {
                if (!name)
                    return res.status(400).json({ error: 'Subject name is required when creating a new subject' });
                const newSubject = await subjectService_1.subjectService.create(name, undefined);
                finalSubjectId = newSubject.id;
            }
            else {
                const existing = await subjectService_1.subjectService.getById(subjectId);
                if (!existing)
                    return res.status(404).json({ error: 'Subject not found' });
            }
            const link = await armService_1.armService.addSubjectToArm(armId, finalSubjectId, teacherId);
            res.status(201).json(link);
        }
        catch (err) {
            console.error('Add subject to arm error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to add subject to arm' });
        }
    },
    updateArmSubjectTeacher: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.subjectId);
        if (!armId || !subjectId)
            return res.status(400).json({ error: 'Invalid armId or subjectId' });
        try {
            const { teacherId } = updateArmSubjectTeacherSchema.parse(req.body);
            const updated = await armService_1.armService.updateArmSubjectTeacher(armId, subjectId, teacherId ?? undefined);
            if (!updated)
                return res.status(404).json({ error: 'Arm-subject relation not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update arm subject teacher error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update teacher' });
        }
    },
    removeArmSubject: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.subjectId);
        if (!armId || !subjectId)
            return res.status(400).json({ error: 'Invalid armId or subjectId' });
        try {
            const result = await armService_1.armService.removeArmSubject(armId, subjectId);
            if (!result)
                return res.status(404).json({ error: 'Arm-subject relation not found' });
            res.json({ message: 'Subject removed from arm' });
        }
        catch (err) {
            console.error('Remove arm subject error:', err);
            res.status(500).json({ error: 'Failed to remove subject from arm' });
        }
    },
    // NEW: Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
    deleteSubjectArm: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await armService_1.armService.deleteSubjectArm(id);
            res.json({ message: 'Subject assignment removed' });
        }
        catch (err) {
            console.error('Delete subject arm error:', err);
            res.status(500).json({ error: 'Failed to delete subject assignment' });
        }
    },
    // ---------- Skill assignment endpoints ----------
    addSkillToArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const { skillId } = addSkillSchema.parse(req.body);
            // Optional: verify skill exists
            // const skillExists = await skillService.getById(skillId);
            // if (!skillExists) return res.status(404).json({ error: 'Skill not found' });
            const link = await armService_1.armService.addSkillToArm(armId, skillId);
            res.status(201).json(link);
        }
        catch (err) {
            console.error('Add skill to arm error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to add skill to arm' });
        }
    },
};
