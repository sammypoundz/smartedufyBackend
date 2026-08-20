"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectController = void 0;
const subjectService_1 = require("../services/subjectService");
const subjectValidation_1 = require("../validations/subjectValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const addToArmSchema = zod_1.z.object({
    subjectId: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    teacherId: zod_1.z.string().optional(),
});
const updateArmSubjectSchema = zod_1.z.object({
    teacherId: zod_1.z.string().optional(),
});
// Schema for toggling topic completion
const updateTopicCompletionSchema = zod_1.z.object({
    completed: zod_1.z.boolean(),
});
// Schema for creating/updating a topic (full data)
const topicSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
    completed: zod_1.z.boolean().optional(),
});
exports.subjectController = {
    // ---------- Global subject CRUD ----------
    getAll: async (req, res) => {
        try {
            const subjects = await subjectService_1.subjectService.getAll();
            res.json(subjects);
        }
        catch (err) {
            console.error('Get all subjects error:', err);
            res.status(500).json({ error: 'Failed to fetch subjects' });
        }
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const subject = await subjectService_1.subjectService.getById(id);
            if (!subject)
                return res.status(404).json({ error: 'Subject not found' });
            res.json(subject);
        }
        catch (err) {
            console.error('Get subject by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch subject' });
        }
    },
    // NEW: Get subject with arm‑specific teacher and class details (requires armId query param)
    getByIdWithArm: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const armId = (0, paramUtils_1.getStringParam)(req.query.armId);
        if (!subjectId || !armId) {
            return res.status(400).json({ error: 'Subject ID and arm ID are required' });
        }
        try {
            const subject = await subjectService_1.subjectService.getByIdWithArm(subjectId, armId);
            if (!subject)
                return res.status(404).json({ error: 'Subject not found' });
            res.json(subject);
        }
        catch (err) {
            console.error('Get subject with arm error:', err);
            res.status(500).json({ error: 'Failed to fetch subject details' });
        }
    },
    create: async (req, res) => {
        try {
            const { name, description } = subjectValidation_1.createSubjectSchema.parse(req.body);
            const newSubject = await subjectService_1.subjectService.create(name, description);
            res.status(201).json(newSubject);
        }
        catch (err) {
            console.error('Create subject error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create subject' });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const { name, description } = subjectValidation_1.updateSubjectSchema.parse(req.body);
            const updated = await subjectService_1.subjectService.update(id, name, description);
            if (!updated)
                return res.status(404).json({ error: 'Subject not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update subject error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update subject' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await subjectService_1.subjectService.delete(id);
            res.json({ message: 'Subject deleted' });
        }
        catch (err) {
            console.error('Delete subject error:', err);
            res.status(500).json({ error: 'Failed to delete subject' });
        }
    },
    // ---------- Arm‑specific subject endpoints ----------
    getByArmId: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const subjects = await subjectService_1.subjectService.getByArmId(armId);
            res.json(subjects);
        }
        catch (err) {
            console.error('Get subjects by arm error:', err);
            res.status(500).json({ error: 'Failed to fetch subjects for arm' });
        }
    },
    addToArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const { subjectId, name, teacherId } = addToArmSchema.parse(req.body);
            let subject;
            if (subjectId) {
                subject = await subjectService_1.subjectService.getById(subjectId);
                if (!subject)
                    return res.status(404).json({ error: 'Subject not found' });
            }
            else {
                if (!name)
                    return res.status(400).json({ error: 'Subject name is required when creating a new subject' });
                subject = await subjectService_1.subjectService.create(name, undefined);
            }
            const link = await subjectService_1.subjectService.linkToArm(subject.id, armId, teacherId);
            res.status(201).json({ subject, link });
        }
        catch (err) {
            console.error('Add subject to arm error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to add subject to arm' });
        }
    },
    updateArmSubject: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const { teacherId } = updateArmSubjectSchema.parse(req.body);
            const updated = await subjectService_1.subjectService.updateArmSubject(id, teacherId);
            if (!updated)
                return res.status(404).json({ error: 'Arm‑subject relation not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update arm‑subject error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update arm‑subject relation' });
        }
    },
    removeFromArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.subjectId);
        if (!armId || !subjectId)
            return res.status(400).json({ error: 'Invalid armId or subjectId' });
        try {
            await subjectService_1.subjectService.removeFromArm(armId, subjectId);
            res.json({ message: 'Subject removed from arm' });
        }
        catch (err) {
            console.error('Remove subject from arm error:', err);
            res.status(500).json({ error: 'Failed to remove subject from arm' });
        }
    },
    // NEW: Delete a subject‑arm relation by its own ID (used for direct removal)
    deleteSubjectArm: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await subjectService_1.subjectService.deleteSubjectArm(id);
            res.json({ message: 'Subject-arm relation deleted' });
        }
        catch (err) {
            console.error('Delete subject-arm error:', err);
            res.status(500).json({ error: 'Failed to delete subject-arm relation' });
        }
    },
    // ---------- Curriculum endpoints ----------
    getCurriculum: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const armId = (0, paramUtils_1.getStringParam)(req.query.armId);
        if (!subjectId || !armId) {
            return res.status(400).json({ error: 'Subject id and arm id are required' });
        }
        try {
            const topics = await subjectService_1.subjectService.getCurriculum(subjectId, armId);
            res.json(topics);
        }
        catch (err) {
            console.error('Get curriculum error:', err);
            res.status(500).json({ error: 'Failed to fetch curriculum' });
        }
    },
    createCurriculum: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const armId = (0, paramUtils_1.getStringParam)(req.query.armId);
        if (!subjectId || !armId) {
            return res.status(400).json({ error: 'Subject id and arm id are required' });
        }
        try {
            const data = topicSchema.parse(req.body);
            const newTopic = await subjectService_1.subjectService.createTopic(subjectId, armId, {
                title: data.title,
                description: data.description,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                completed: data.completed ?? false,
            });
            res.status(201).json(newTopic);
        }
        catch (err) {
            console.error('Create curriculum error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create topic' });
        }
    },
    updateCurriculum: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const topicId = (0, paramUtils_1.getStringParam)(req.params.topicId);
        if (!subjectId || !topicId) {
            return res.status(400).json({ error: 'Invalid subject or topic id' });
        }
        try {
            const data = topicSchema.parse(req.body);
            const updated = await subjectService_1.subjectService.updateTopic(topicId, {
                title: data.title,
                description: data.description,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                completed: data.completed,
            });
            if (!updated)
                return res.status(404).json({ error: 'Topic not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update curriculum error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update topic' });
        }
    },
    updateTopicCompletion: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const topicId = (0, paramUtils_1.getStringParam)(req.params.topicId);
        if (!subjectId || !topicId)
            return res.status(400).json({ error: 'Invalid subject or topic id' });
        try {
            const { completed } = updateTopicCompletionSchema.parse(req.body);
            const updated = await subjectService_1.subjectService.updateTopicCompletion(subjectId, topicId, completed);
            if (!updated)
                return res.status(404).json({ error: 'Topic not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update topic completion error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update topic completion' });
        }
    },
    deleteCurriculum: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const topicId = (0, paramUtils_1.getStringParam)(req.params.topicId);
        if (!subjectId || !topicId) {
            return res.status(400).json({ error: 'Invalid subject or topic id' });
        }
        try {
            await subjectService_1.subjectService.deleteTopic(topicId);
            res.json({ message: 'Topic deleted' });
        }
        catch (err) {
            console.error('Delete curriculum error:', err);
            res.status(500).json({ error: 'Failed to delete topic' });
        }
    },
    getPerformance: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.id);
        const armId = (0, paramUtils_1.getStringParam)(req.query.armId);
        if (!subjectId || !armId) {
            return res.status(400).json({ error: 'Subject id and arm id are required' });
        }
        try {
            const performance = await subjectService_1.subjectService.getPerformance(subjectId, armId);
            res.json(performance || null);
        }
        catch (err) {
            console.error('Get performance error:', err);
            res.status(500).json({ error: 'Failed to fetch performance data' });
        }
    },
};
