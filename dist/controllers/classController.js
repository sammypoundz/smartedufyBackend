"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classController = void 0;
const classService_1 = require("../services/classService");
const armService_1 = require("../services/armService");
const classValidation_1 = require("../validations/classValidation");
const paramUtils_1 = require("../utils/paramUtils");
const db_1 = __importDefault(require("../config/db"));
exports.classController = {
    /**
     * GET /api/classes
     * Returns all classes with arms, each arm including:
     * - teacher (id, name, email, phone)
     * - student count (_count.students)
     */
    getAll: async (req, res) => {
        try {
            const classes = await db_1.default.class.findMany({
                include: {
                    arms: {
                        include: {
                            teacher: {
                                select: { id: true, name: true, email: true, phone: true },
                            },
                            _count: {
                                select: { students: true }, // 👈 student counter
                            },
                        },
                    },
                },
                orderBy: { name: 'asc' },
            });
            res.json(classes);
        }
        catch (err) {
            console.error('Get all classes error:', err);
            res.status(500).json({ error: 'Failed to fetch classes' });
        }
    },
    /**
     * GET /api/classes/:id
     * Returns a single class with arms, teacher details, and student count.
     */
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const cls = await db_1.default.class.findUnique({
                where: { id },
                include: {
                    arms: {
                        include: {
                            teacher: {
                                select: { id: true, name: true, email: true, phone: true },
                            },
                            _count: {
                                select: { students: true },
                            },
                        },
                    },
                    // students: true, // removed – not needed for the class detail view
                },
            });
            if (!cls)
                return res.status(404).json({ error: 'Class not found' });
            res.json(cls);
        }
        catch (err) {
            console.error('Get class by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch class' });
        }
    },
    /**
     * GET /api/classes/:classId/arms
     * Returns all arms for a given class (uses armService, already correct).
     */
    getArmsByClassId: async (req, res) => {
        const classId = (0, paramUtils_1.getStringParam)(req.params.classId);
        if (!classId)
            return res.status(400).json({ error: 'Invalid classId' });
        try {
            const arms = await armService_1.armService.getByClassId(classId);
            res.json(arms);
        }
        catch (err) {
            console.error('Get arms by class ID error:', err);
            res.status(500).json({ error: 'Failed to fetch arms for class' });
        }
    },
    /**
     * POST /api/classes
     * Create a new class (admin only)
     */
    create: async (req, res) => {
        try {
            const { name } = classValidation_1.createClassSchema.parse(req.body);
            const newClass = await classService_1.classService.create(name);
            res.status(201).json(newClass);
        }
        catch (err) {
            console.error('Create class error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create class' });
        }
    },
    /**
     * PUT /api/classes/:id
     * Update a class name (admin only)
     */
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const { name } = classValidation_1.updateClassSchema.parse(req.body);
            if (!name)
                return res.status(400).json({ error: 'Name is required' });
            const updated = await classService_1.classService.update(id, name);
            res.json(updated);
        }
        catch (err) {
            console.error('Update class error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update class' });
        }
    },
    /**
     * DELETE /api/classes/:id
     * Delete a class (admin only)
     */
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await classService_1.classService.delete(id);
            res.json({ message: 'Class deleted' });
        }
        catch (err) {
            console.error('Delete class error:', err);
            res.status(500).json({ error: 'Failed to delete class' });
        }
    },
};
