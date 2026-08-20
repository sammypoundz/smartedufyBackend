"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testController = void 0;
const testService_1 = require("../services/testService");
const testValidation_1 = require("../validations/testValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.testController = {
    getAll: async (req, res) => {
        try {
            // Extract query parameters for filtering
            const armId = req.query.armId;
            const status = req.query.status;
            // Call service with optional filters
            const tests = await testService_1.testService.getAll({ armId, status });
            res.json(tests);
        }
        catch (err) {
            console.error('Get tests error:', err);
            res.status(500).json({ error: 'Failed to fetch tests' });
        }
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const test = await testService_1.testService.getById(id);
            if (!test)
                return res.status(404).json({ error: 'Test not found' });
            res.json(test);
        }
        catch (err) {
            console.error('Get test by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch test' });
        }
    },
    create: async (req, res) => {
        try {
            const data = testValidation_1.createTestSchema.parse(req.body);
            const newTest = await testService_1.testService.create(data);
            res.status(201).json(newTest);
        }
        catch (err) {
            console.error('Create test error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to create test' });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = testValidation_1.updateTestSchema.parse(req.body);
            const updated = await testService_1.testService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Test not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update test error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to update test' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const existingTest = await testService_1.testService.getById(id);
            if (!existingTest) {
                return res.status(404).json({ error: 'Test not found' });
            }
            await testService_1.testService.delete(id);
            res.json({ message: 'Test deleted successfully' });
        }
        catch (err) {
            console.error('Delete test error:', err);
            res.status(500).json({ error: 'Failed to delete test' });
        }
    },
};
