"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionController = void 0;
const questionService_1 = require("../services/questionService");
const questionValidation_1 = require("../validations/questionValidation");
const paramUtils_1 = require("../utils/paramUtils");
const db_1 = __importDefault(require("../config/db"));
exports.questionController = {
    /**
     * GET /questions/test/:testId
     * Returns all questions for a given test, ordered by creation date.
     * Includes subject relation for frontend grouping.
     */
    getByTestId: async (req, res) => {
        const testId = (0, paramUtils_1.getStringParam)(req.params.testId);
        if (!testId)
            return res.status(400).json({ error: 'Invalid testId' });
        try {
            const questions = await questionService_1.questionService.getByTestId(testId);
            res.json(questions);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch questions' });
        }
    },
    /**
     * POST /questions
     * Creates a new question (supports subjectId, attachmentType, attachmentUrl).
     * Increments the parent test's questionCount.
     */
    create: async (req, res) => {
        try {
            // Log the incoming request body for debugging
            console.log('🔍 Create question - request body:', req.body);
            const data = questionValidation_1.createQuestionSchema.parse(req.body);
            console.log('✅ Parsed question data:', data);
            const question = await questionService_1.questionService.create(data);
            console.log('📝 Created question:', { id: question.id, subjectId: question.subjectId });
            await db_1.default.test.update({
                where: { id: data.testId },
                data: { questionCount: { increment: 1 } },
            });
            res.status(201).json(question);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                console.error('❌ Zod validation error:', err.errors);
                return res.status(400).json({ error: err.errors });
            }
            console.error('❌ Create question error:', err);
            res.status(500).json({ error: 'Failed to create question' });
        }
    },
    /**
     * PUT /questions/:id
     * Updates an existing question (supports subjectId, attachment fields).
     */
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            console.log('🔍 Update question - request body:', req.body);
            const data = questionValidation_1.updateQuestionSchema.parse(req.body);
            console.log('✅ Parsed update data:', data);
            const updated = await questionService_1.questionService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Question not found' });
            console.log('📝 Updated question:', { id: updated.id, subjectId: updated.subjectId });
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                console.error('❌ Zod validation error:', err.errors);
                return res.status(400).json({ error: err.errors });
            }
            console.error('❌ Update question error:', err);
            res.status(500).json({ error: 'Failed to update question' });
        }
    },
    /**
     * DELETE /questions/:id
     * Deletes a question and decrements the parent test's questionCount.
     */
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const question = await questionService_1.questionService.getById(id);
            if (!question)
                return res.status(404).json({ error: 'Question not found' });
            await questionService_1.questionService.delete(id);
            await db_1.default.test.update({
                where: { id: question.testId },
                data: { questionCount: { decrement: 1 } },
            });
            res.json({ message: 'Question deleted' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete question' });
        }
    },
    /**
     * POST /questions/upload
     * Handles file upload (image, video, audio) for question attachments.
     * Expects a multipart/form-data file with field name "file".
     * Returns { attachmentUrl, attachmentType }.
     */
    uploadMedia: async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/uploads/questions/${req.file.filename}`;
        let attachmentType;
        if (req.file.mimetype.startsWith('image/'))
            attachmentType = 'image';
        else if (req.file.mimetype.startsWith('video/'))
            attachmentType = 'video';
        else if (req.file.mimetype.startsWith('audio/'))
            attachmentType = 'audio';
        else
            attachmentType = 'file';
        res.json({ attachmentUrl: fileUrl, attachmentType });
    },
};
