"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicController = void 0;
const academicService_1 = require("../services/academicService");
const zod_1 = require("zod");
const gradingScalesSchema = zod_1.z.object({
    scales: zod_1.z.array(zod_1.z.object({
        grade: zod_1.z.string(),
        min: zod_1.z.number(),
        max: zod_1.z.number(),
    })),
    groupId: zod_1.z.string().nullable().optional(),
});
const gradingScaleGroupSchema = zod_1.z.object({ name: zod_1.z.string().min(1) });
const assignGradingScaleGroupSchema = zod_1.z.object({ groupId: zod_1.z.string().nullable() });
const academicYearSchema = zod_1.z.object({
    name: zod_1.z.string(),
    terms: zod_1.z.array(zod_1.z.string()),
});
const setSessionSchema = zod_1.z.object({
    yearId: zod_1.z.string(),
    termId: zod_1.z.string(),
});
// Schema for pushing test attempts
const pushTestAttemptsSchema = zod_1.z.object({
    testId: zod_1.z.string(),
    academicYearId: zod_1.z.string(),
    term: zod_1.z.string(),
    resultType: zod_1.z.enum(['ca', 'exam']),
});
exports.academicController = {
    // Grading scales
    getGradingScales: async (req, res) => {
        try {
            const scales = await academicService_1.academicService.getGradingScales();
            res.json(scales);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch grading scales' });
        }
    },
    saveGradingScales: async (req, res) => {
        try {
            const { scales, groupId } = gradingScalesSchema.parse(req.body);
            await academicService_1.academicService.saveGradingScales(scales, groupId ?? null);
            res.json({ success: true });
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to save grading scales' });
        }
    },
    // Grading scale groups
    getGradingScaleGroups: async (req, res) => {
        try {
            const groups = await academicService_1.academicService.getGradingScaleGroups();
            res.json(groups);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch grading scale groups' });
        }
    },
    createGradingScaleGroup: async (req, res) => {
        try {
            const { name } = gradingScaleGroupSchema.parse(req.body);
            const group = await academicService_1.academicService.createGradingScaleGroup(name);
            res.status(201).json(group);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.code === 'P2002')
                return res.status(409).json({ error: 'A group with this name already exists' });
            console.error(err);
            res.status(500).json({ error: 'Failed to create grading scale group' });
        }
    },
    updateGradingScaleGroup: async (req, res) => {
        try {
            const { name } = gradingScaleGroupSchema.parse(req.body);
            const group = await academicService_1.academicService.updateGradingScaleGroup(String(req.params.id), name);
            res.json(group);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update grading scale group' });
        }
    },
    deleteGradingScaleGroup: async (req, res) => {
        try {
            await academicService_1.academicService.deleteGradingScaleGroup(String(req.params.id));
            res.json({ success: true });
        }
        catch (err) {
            if (err.message?.includes('Cannot delete'))
                return res.status(400).json({ error: err.message });
            console.error(err);
            res.status(500).json({ error: 'Failed to delete grading scale group' });
        }
    },
    assignGradingScaleGroupToClass: async (req, res) => {
        try {
            const { groupId } = assignGradingScaleGroupSchema.parse(req.body);
            const updated = await academicService_1.academicService.assignGradingScaleGroupToClass(String(req.params.classId), groupId);
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to assign grading scale group to class' });
        }
    },
    // Academic years
    getAcademicYears: async (req, res) => {
        try {
            const years = await academicService_1.academicService.getAllAcademicYears();
            res.json(years);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch academic years' });
        }
    },
    createAcademicYear: async (req, res) => {
        try {
            const { name, terms } = academicYearSchema.parse(req.body);
            const year = await academicService_1.academicService.createAcademicYear(name, terms);
            res.status(201).json(year);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to create academic year' });
        }
    },
    // Current session
    getCurrentSession: async (req, res) => {
        try {
            const session = await academicService_1.academicService.getCurrentSession();
            res.json(session);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch current session' });
        }
    },
    setCurrentSession: async (req, res) => {
        try {
            const { yearId, termId } = setSessionSchema.parse(req.body);
            await academicService_1.academicService.setCurrentSession(yearId, termId);
            res.json({ success: true });
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to set current session' });
        }
    },
    // NEW: Push test attempt scores to student results (CA or Exam) – uses service
    pushTestAttemptsToResults: async (req, res) => {
        try {
            const data = pushTestAttemptsSchema.parse(req.body);
            const result = await academicService_1.academicService.pushTestAttemptsToResults(data);
            res.json({ message: `Successfully pushed ${result.count} results to ${data.resultType}` });
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error('Push test attempts error:', err);
            res.status(500).json({ error: err.message || 'Failed to push results' });
        }
    },
};
