"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherService = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantContext_1 = require("../utils/tenantContext");
exports.teacherService = {
    /**
     * Get all teachers with their user email, assigned arms (with class), and subjects taught (with arm & class).
     */
    getAll: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.teacher.findMany({
            where: { schoolId: tenantId },
            include: {
                user: { select: { email: true, role: true, isActive: true } },
                arms: {
                    where: { schoolId: tenantId },
                    include: { class: true },
                },
                subjectArms: {
                    where: { schoolId: tenantId },
                    include: {
                        subject: true,
                        arm: {
                            include: { class: true },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });
    },
    /**
     * Get a single teacher by ID, including all relations.
     * @param id - Teacher ID
     */
    getById: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 teacherService.getById called with:', id);
        return db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
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
                    where: { schoolId: tenantId },
                    include: {
                        class: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    },
                },
                subjectArms: {
                    where: { schoolId: tenantId },
                    include: {
                        subject: {
                            select: {
                                id: true,
                                name: true,
                            }
                        },
                        arm: {
                            include: {
                                class: {
                                    select: {
                                        name: true,
                                    }
                                }
                            },
                        },
                    },
                },
            },
        });
    },
    /**
     * Get a teacher by userId (for class service and auth).
     * @param userId - The user ID from the User table
     * @returns The teacher with basic info
     */
    getByUserId: async (userId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 teacherService.getByUserId called with userId:', userId);
        if (!userId) {
            console.log('❌ No userId provided to getByUserId');
            return null;
        }
        try {
            const teacher = await db_1.default.teacher.findUnique({
                where: { userId: userId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    schoolId: true,
                    isActive: true,
                    userId: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            role: true,
                            isActive: true,
                        }
                    }
                }
            });
            if (teacher) {
                console.log('✅ Teacher found:', teacher.name, 'Teacher ID:', teacher.id);
            }
            else {
                console.log('❌ No teacher found for userId:', userId);
            }
            return teacher;
        }
        catch (error) {
            console.error('❌ Error in getByUserId:', error);
            throw error;
        }
    },
    /**
     * Create a new teacher. Automatically creates a User account for them.
     * @param data - Teacher data (name, email, phone, optional userId)
     * @returns The created teacher with relations.
     */
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 Creating new teacher with data:', data);
        let userId = data.userId;
        if (!userId) {
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
            const user = await db_1.default.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    password: hashedPassword,
                    role: 'TEACHER',
                    isActive: true,
                    schoolId: tenantId,
                },
            });
            userId = user.id;
            console.log('✅ Created new user for teacher:', userId);
        }
        const teacher = await db_1.default.teacher.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone || '',
                userId,
                schoolId: tenantId,
            },
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
                    where: { schoolId: tenantId },
                    include: { class: true },
                },
                subjectArms: {
                    where: { schoolId: tenantId },
                    include: { subject: true, arm: { include: { class: true } } },
                },
            },
        });
        console.log('✅ Teacher created:', teacher.name);
        return teacher;
    },
    /**
     * Update an existing teacher.
     * Also syncs changes to the associated User record (name, email, isActive).
     * @param id - Teacher ID
     * @param data - Partial data (name, email, phone, isActive)
     * @returns The updated teacher with relations.
     */
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 Updating teacher:', id, data);
        const teacher = await db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
            include: { user: true },
        });
        if (!teacher) {
            console.log('❌ Teacher not found for update:', id);
            throw new Error('Teacher not found');
        }
        const updatedTeacher = await db_1.default.teacher.update({
            where: { id, schoolId: tenantId },
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                isActive: data.isActive,
            },
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
                    where: { schoolId: tenantId },
                    include: { class: true },
                },
                subjectArms: {
                    where: { schoolId: tenantId },
                    include: { subject: true, arm: { include: { class: true } } },
                },
            },
        });
        // Sync changes to the associated User record
        if (data.name || data.email || data.isActive !== undefined) {
            await db_1.default.user.update({
                where: { id: teacher.userId, schoolId: tenantId },
                data: {
                    name: data.name,
                    email: data.email,
                    isActive: data.isActive,
                },
            });
            console.log('✅ User record synced for teacher:', teacher.userId);
        }
        console.log('✅ Teacher updated:', updatedTeacher.name);
        return updatedTeacher;
    },
    /**
     * Delete a teacher.
     * Cleans up all related records (arm assignments, subject-arms, subject-teacher
     * join rows and the linked User account) so there are no orphaned rows.
     * @param id - Teacher ID
     * @returns The deleted teacher.
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 Deleting teacher:', id);
        return db_1.default.$transaction(async (tx) => {
            const teacher = await tx.teacher.findUnique({
                where: { id, schoolId: tenantId },
            });
            if (!teacher)
                throw new Error('Teacher not found');
            // Release arms previously assigned to this teacher
            await tx.arm.updateMany({
                where: { teacherId: teacher.id, schoolId: tenantId },
                data: { teacherId: null },
            });
            // Remove subject-arm teaching assignments
            await tx.subjectArm.updateMany({
                where: { teacherId: teacher.id, schoolId: tenantId },
                data: { teacherId: null },
            });
            // Remove subject-teacher join rows
            await tx.subjectTeacher.deleteMany({
                where: { teacherId: teacher.id, schoolId: tenantId },
            });
            const deleted = await tx.teacher.delete({
                where: { id, schoolId: tenantId },
            });
            // Remove the linked user account
            await tx.user.delete({
                where: { id: teacher.userId, schoolId: tenantId },
            });
            return deleted;
        });
    },
    /**
     * Reset a teacher's password.
     * Generates a random password, hashes it, updates the associated User, and returns the plain password.
     * @param id - Teacher ID
     * @returns The new plain‑text password.
     */
    resetPassword: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('🔍 Resetting password for teacher:', id);
        const teacher = await db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
            include: { user: true },
        });
        if (!teacher) {
            console.log('❌ Teacher not found for password reset:', id);
            throw new Error('Teacher not found');
        }
        const newPassword = Math.random().toString(36).slice(-8);
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db_1.default.user.update({
            where: { id: teacher.userId, schoolId: tenantId },
            data: { password: hashed },
        });
        console.log('✅ Password reset for teacher:', teacher.name);
        return newPassword;
    },
};
