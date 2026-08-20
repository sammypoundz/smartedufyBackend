"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentController = void 0;
const parentService_1 = require("../services/parentService");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const createParentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email(),
});
const updateParentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
});
exports.parentController = {
    // Get all parents (for dropdown)
    getAll: async (req, res) => {
        try {
            const parents = await parentService_1.parentService.getAll();
            res.json(parents);
        }
        catch (err) {
            console.error('Get all parents error:', err);
            res.status(500).json({ error: 'Failed to fetch parents' });
        }
    },
    // Get single parent by ID
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const parent = await parentService_1.parentService.getById(id);
            if (!parent)
                return res.status(404).json({ error: 'Parent not found' });
            res.json(parent);
        }
        catch (err) {
            console.error('Get parent by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch parent' });
        }
    },
    // Create a new parent (automatically creates a User with role PARENT)
    create: async (req, res) => {
        try {
            const data = createParentSchema.parse(req.body);
            const parent = await parentService_1.parentService.create(data);
            res.status(201).json(parent);
        }
        catch (err) {
            console.error('Create parent error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            // Handle duplicate email from user creation
            if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
                return res.status(409).json({ error: 'A user with this email already exists' });
            }
            res.status(500).json({ error: 'Failed to create parent' });
        }
    },
    // Update parent information (name, phone, email)
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = updateParentSchema.parse(req.body);
            const updated = await parentService_1.parentService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Parent not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update parent error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
                return res.status(409).json({ error: 'A user with this email already exists' });
            }
            res.status(500).json({ error: 'Failed to update parent' });
        }
    },
    // Delete a parent (does not delete the associated User by default – be careful)
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await parentService_1.parentService.delete(id);
            res.json({ message: 'Parent deleted' });
        }
        catch (err) {
            console.error('Delete parent error:', err);
            res.status(500).json({ error: 'Failed to delete parent' });
        }
    },
};
