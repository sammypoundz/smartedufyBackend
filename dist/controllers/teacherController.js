"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherController = void 0;
const teacherService_1 = require("../services/teacherService");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const db_1 = __importDefault(require("../config/db"));

const createTeacherSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().optional(),
    userId: zod_1.z.string().optional(),
});

const updateTeacherSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(), // for suspend/activate
});

exports.teacherController = {
    // Get all teachers
    getAll: async (req, res) => {
        try {
            const teachers = await teacherService_1.teacherService.getAll();
            res.json(teachers);
        }
        catch (err) {
            console.error('Get all teachers error:', err);
            res.status(500).json({ error: 'Failed to fetch teachers' });
        }
    },

    // Get a single teacher by ID (can be teacher id OR user id)
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        
        try {
            console.log('🔍 Looking for teacher with identifier:', id);
            
            // First try to find by teacher ID
            let teacher = await teacherService_1.teacherService.getById(id);
            
            // If not found, try to find by userId
            if (!teacher) {
                console.log('🔍 Teacher not found by ID, trying by userId:', id);
                teacher = await db_1.default.teacher.findUnique({
                    where: { userId: id },
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                role: true,
                                isActive: true,
                            }
                        },
                        arms: {
                            include: {
                                class: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        },
                        subjectArms: {
                            include: {
                                subject: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                },
                                arm: {
                                    select: {
                                        id: true,
                                        letter: true,
                                        class: {
                                            select: {
                                                name: true,
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
            
            if (!teacher) {
                console.log('❌ Teacher not found for identifier:', id);
                return res.status(404).json({ 
                    error: 'Teacher not found',
                    message: 'No teacher profile exists for this user. Please contact your administrator.'
                });
            }
            
            console.log('✅ Teacher found:', teacher.name);
            res.json(teacher);
        }
        catch (err) {
            console.error('Get teacher by ID error:', err);
            res.status(500).json({ 
                error: 'Failed to fetch teacher',
                details: err.message 
            });
        }
    },

    // Create a new teacher (admin only)
    create: async (req, res) => {
        try {
            const data = createTeacherSchema.parse(req.body);
            const teacher = await teacherService_1.teacherService.create(data);
            res.status(201).json(teacher);
        }
        catch (err) {
            console.error('Create teacher error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create teacher' });
        }
    },

    // Update an existing teacher (admin only)
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        
        try {
            const data = updateTeacherSchema.parse(req.body);
            const updated = await teacherService_1.teacherService.update(id, data);
            if (!updated) return res.status(404).json({ error: 'Teacher not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update teacher error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update teacher' });
        }
    },

    // Delete a teacher (admin only)
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        
        try {
            await teacherService_1.teacherService.delete(id);
            res.json({ message: 'Teacher deleted' });
        }
        catch (err) {
            console.error('Delete teacher error:', err);
            res.status(500).json({ error: 'Failed to delete teacher' });
        }
    },

    // Reset teacher password (admin only)
    resetPassword: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        
        try {
            const newPassword = await teacherService_1.teacherService.resetPassword(id);
            res.json({ password: newPassword });
        }
        catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({ error: err.message });
        }
    },
};