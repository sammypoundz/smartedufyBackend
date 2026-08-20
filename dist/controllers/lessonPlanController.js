"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonPlanController = void 0;
const lessonPlanService_1 = require("../services/lessonPlanService");
const lessonPlanValidation_1 = require("../validations/lessonPlanValidation");
const paramUtils_1 = require("../utils/paramUtils");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
exports.lessonPlanController = {
    // GET /lesson-plans?classId=&armId=&subjectId=
    getAll: async (req, res) => {
        try {
            const { classId, armId, subjectId } = req.query;
            const filters = {};
            if (classId && typeof classId === 'string')
                filters.classId = classId;
            if (armId && typeof armId === 'string')
                filters.armId = armId;
            if (subjectId && typeof subjectId === 'string')
                filters.subjectId = subjectId;
            const plans = await lessonPlanService_1.lessonPlanService.getAll(filters);
            // Transform to include readable names
            const transformed = plans.map((p) => ({
                ...p,
                className: p.class?.name,
                armLetter: p.arm?.letter,
                subjectName: p.subject?.name,
            }));
            res.json(transformed);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch lesson plans' });
        }
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const plan = await lessonPlanService_1.lessonPlanService.getById(id);
            if (!plan)
                return res.status(404).json({ error: 'Lesson plan not found' });
            const transformed = {
                ...plan,
                className: plan.class?.name,
                armLetter: plan.arm?.letter,
                subjectName: plan.subject?.name,
            };
            res.json(transformed);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch lesson plan' });
        }
    },
    // POST /lesson-plans (multipart/form-data)
    create: async (req, res) => {
        try {
            const file = req.file;
            if (!file)
                return res.status(400).json({ error: 'File is required' });
            // Validate text fields
            const parsed = lessonPlanValidation_1.createLessonPlanSchema.parse({
                title: req.body.title,
                description: req.body.description,
                classId: req.body.classId,
                armId: req.body.armId,
                subjectId: req.body.subjectId,
                status: req.body.status,
            });
            const newPlan = await lessonPlanService_1.lessonPlanService.create({
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
        }
        catch (err) {
            console.error(err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to create lesson plan' });
        }
    },
    // PUT /lesson-plans/:id (multipart/form-data, file optional)
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const existing = await lessonPlanService_1.lessonPlanService.getById(id);
            if (!existing)
                return res.status(404).json({ error: 'Lesson plan not found' });
            // Validate text fields (optional)
            const parsed = lessonPlanValidation_1.updateLessonPlanSchema.parse({
                title: req.body.title,
                description: req.body.description,
                classId: req.body.classId,
                armId: req.body.armId,
                subjectId: req.body.subjectId,
                status: req.body.status,
            });
            const updateData = { ...parsed };
            const file = req.file;
            if (file) {
                // Delete old file if exists
                if (existing.fileUrl) {
                    await promises_1.default.unlink(existing.fileUrl).catch(() => { });
                }
                updateData.fileUrl = file.path;
                updateData.fileName = file.originalname;
                updateData.fileType = file.mimetype;
            }
            const updated = await lessonPlanService_1.lessonPlanService.update(id, updateData);
            res.json(updated);
        }
        catch (err) {
            console.error(err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to update lesson plan' });
        }
    },
    // DELETE /lesson-plans/:id
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const existing = await lessonPlanService_1.lessonPlanService.getById(id);
            if (!existing)
                return res.status(404).json({ error: 'Lesson plan not found' });
            if (existing.fileUrl) {
                await promises_1.default.unlink(existing.fileUrl).catch(() => { });
            }
            await lessonPlanService_1.lessonPlanService.delete(id);
            res.json({ message: 'Lesson plan deleted' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete lesson plan' });
        }
    },
    // GET /lesson-plans/:id/download
    download: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const info = await lessonPlanService_1.lessonPlanService.getFileInfo(id);
            if (!info)
                return res.status(404).json({ error: 'File not found' });
            const filePath = path_1.default.resolve(info.fileUrl);
            res.download(filePath, info.fileName);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to download file' });
        }
    },
};
