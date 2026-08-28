"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
    /**
     * GET /api/teachers/me
     * Get the authenticated teacher's profile
     */
    getMe: async (req, res) => {
        try {
            // Use optional chaining to safely access req.user
            const userId = req.user?.id;
            console.log('🔍 getMe called with userId:', userId);
            console.log('🔍 Full user object:', JSON.stringify(req.user, null, 2));
            if (!userId) {
                console.log('❌ No userId found in request');
                return res.status(401).json({ error: 'Unauthorized - User ID not found' });
            }
            // First, check if the user exists in the User table
            const user = await db_1.default.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    name: true,
                    isActive: true,
                    schoolId: true,
                }
            });
            if (!user) {
                console.log('❌ User not found:', userId);
                return res.status(404).json({
                    error: 'User not found',
                    message: 'The authenticated user does not exist in the system.'
                });
            }
            console.log('✅ User found:', user.email, 'Role:', user.role);
            // Check if the user has a teacher record
            const teacher = await db_1.default.teacher.findUnique({
                where: { userId: userId },
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
            if (!teacher) {
                console.log('❌ Teacher record not found for user:', userId);
                console.log('ℹ️ The user exists but does not have a teacher profile.');
                console.log('ℹ️ User role:', user.role);
                // Return a helpful response instead of 404
                return res.status(404).json({
                    error: 'Teacher profile not found',
                    message: 'No teacher profile exists for this user. Please contact your administrator.',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                    },
                    // Suggest creating a teacher record
                    suggestion: 'Create a teacher record for this user in the Teacher table.',
                });
            }
            console.log('✅ Teacher found:', teacher.name, 'ID:', teacher.id);
            console.log('✅ Arms count:', teacher.arms?.length || 0);
            console.log('✅ Subject arms count:', teacher.subjectArms?.length || 0);
            res.json(teacher);
        }
        catch (err) {
            console.error('❌ Get current teacher error:', err);
            console.error('❌ Error stack:', err.stack);
            res.status(500).json({
                error: 'Failed to fetch teacher profile',
                message: err.message,
                details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            });
        }
    },
    // Get a single teacher by ID
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const teacher = await teacherService_1.teacherService.getById(id);
            if (!teacher)
                return res.status(404).json({ error: 'Teacher not found' });
            res.json(teacher);
        }
        catch (err) {
            console.error('Get teacher by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch teacher' });
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
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = updateTeacherSchema.parse(req.body);
            const updated = await teacherService_1.teacherService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Teacher not found' });
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
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
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
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
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
