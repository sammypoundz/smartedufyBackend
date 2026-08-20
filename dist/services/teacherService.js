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
                user: { select: { email: true } },
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
        return db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
            include: {
                user: true,
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
        });
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
        }
        return db_1.default.teacher.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone || '',
                userId,
                schoolId: tenantId,
            },
            include: {
                user: true,
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
        const teacher = await db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
            include: { user: true },
        });
        if (!teacher)
            throw new Error('Teacher not found');
        const updatedTeacher = await db_1.default.teacher.update({
            where: { id, schoolId: tenantId },
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                isActive: data.isActive,
            },
            include: {
                user: true,
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
        }
        return updatedTeacher;
    },
    /**
     * Delete a teacher.
     * @param id - Teacher ID
     * @returns The deleted teacher.
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.teacher.delete({
            where: { id, schoolId: tenantId },
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
        const teacher = await db_1.default.teacher.findUnique({
            where: { id, schoolId: tenantId },
            include: { user: true },
        });
        if (!teacher)
            throw new Error('Teacher not found');
        const newPassword = Math.random().toString(36).slice(-8);
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db_1.default.user.update({
            where: { id: teacher.userId, schoolId: tenantId },
            data: { password: hashed },
        });
        return newPassword;
    },
};
