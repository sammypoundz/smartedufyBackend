"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessmentFormatController = void 0;
const assessmentFormatService_1 = require("../services/assessmentFormatService");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const createFormatSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    ca: zod_1.z.number().int().min(0).max(100),
    exam: zod_1.z.number().int().min(0).max(100),
});
const updateFormatSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    ca: zod_1.z.number().int().min(0).max(100).optional(),
    exam: zod_1.z.number().int().min(0).max(100).optional(),
});
exports.assessmentFormatController = {
    // GET /assessment-formats
    getAll: async (req, res) => {
        try {
            const formats = await assessmentFormatService_1.assessmentFormatService.getAll();
            res.json(formats);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch assessment formats' });
        }
    },
    // GET /assessment-formats/:id
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const format = await assessmentFormatService_1.assessmentFormatService.getById(id);
            if (!format)
                return res.status(404).json({ error: 'Format not found' });
            res.json(format);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch format' });
        }
    },
    // POST /assessment-formats
    create: async (req, res) => {
        try {
            const data = createFormatSchema.parse(req.body);
            const format = await assessmentFormatService_1.assessmentFormatService.create(data);
            res.status(201).json(format);
        }
        catch (err) {
            console.error(err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: err.message || 'Failed to create format' });
        }
    },
    // PUT /assessment-formats/:id
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = updateFormatSchema.parse(req.body);
            const updated = await assessmentFormatService_1.assessmentFormatService.update(id, data);
            res.json(updated);
        }
        catch (err) {
            console.error(err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.message === 'Format not found') {
                return res.status(404).json({ error: err.message });
            }
            res.status(500).json({ error: err.message || 'Failed to update format' });
        }
    },
    // DELETE /assessment-formats/:id
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await assessmentFormatService_1.assessmentFormatService.delete(id);
            res.json({ message: 'Assessment format deleted successfully' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete format' });
        }
    },
};
