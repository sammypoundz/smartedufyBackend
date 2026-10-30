"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantContext_1 = require("../utils/tenantContext");
const idGeneratorService_1 = require("./idGeneratorService");
exports.userService = {
    /**
     * Ensure the role-specific profile row exists for every role the user
     * holds (primary role OR any secondary role in `roles`). Without this,
     * a user with a dual role like ACCOUNTANT + TEACHER never gets a Teacher
     * profile and therefore cannot appear on the Teachers page or be given
     * teacher functionality (arms, subjects, results, etc.).
     */
    syncProfileRows: async (tx, user) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const heldRoles = Array.from(new Set([...(user.roles || []), user.role])).filter(Boolean);
        if (heldRoles.includes('TEACHER')) {
            const existing = await tx.teacher.findUnique({ where: { userId: user.id } });
            if (!existing) {
                await tx.teacher.create({
                    data: {
                        name: user.name || user.email || '',
                        email: user.email || '',
                        phone: '',
                        userId: user.id,
                        schoolId: tenantId,
                    },
                });
            }
        }
        if (heldRoles.includes('PARENT')) {
            const existing = await tx.parent.findUnique({ where: { userId: user.id } });
            if (!existing) {
                await tx.parent.create({
                    data: {
                        name: user.name || user.email || '',
                        email: user.email || '',
                        phone: '',
                        userId: user.id,
                        schoolId: tenantId,
                    },
                });
            }
        }
        // Student profile is deliberately NOT auto-created from `roles` — student
        // rows carry admission numbers, class placement and other required data
        // that must be provisioned through the student enrolment flow.
    },
    getAllUsers: async () => {
        // middleware adds schoolId to where automatically
        const users = await db_1.default.user.findMany({
            include: {
                student: true,
                teacher: true,
                parent: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return users.map(user => {
            let name = null;
            if (user.role === 'STUDENT' && user.student)
                name = user.student.name;
            else if (user.role === 'TEACHER' && user.teacher)
                name = user.teacher.name;
            else if (user.role === 'PARENT' && user.parent)
                name = user.parent.name;
            else if (user.name)
                name = user.name;
            else
                name = user.email.split('@')[0];
            return {
                id: user.id,
                name,
                email: user.email,
                role: user.role,
                roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
                isActive: user.isActive,
                allowedPages: user.allowedPages || [],
                createdAt: user.createdAt,
            };
        });
    },
    getRecentUsers: async (limit) => {
        // middleware adds schoolId
        const users = await db_1.default.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                student: { select: { name: true } },
                teacher: { select: { name: true } },
                parent: { select: { name: true } },
            },
        });
        return users.map(user => ({
            id: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            name: user.student?.name || user.teacher?.name || user.parent?.name || user.name || user.email.split('@')[0],
        }));
    },
    getUserById: async (id) => {
        // middleware adds schoolId
        const user = await db_1.default.user.findUnique({
            where: { id },
            include: {
                student: true,
                teacher: true,
                parent: true,
            },
        });
        if (!user)
            return null;
        let name = null;
        if (user.role === 'STUDENT' && user.student)
            name = user.student.name;
        else if (user.role === 'TEACHER' && user.teacher)
            name = user.teacher.name;
        else if (user.role === 'PARENT' && user.parent)
            name = user.parent.name;
        else if (user.name)
            name = user.name;
        else
            name = user.email.split('@')[0];
        return {
            id: user.id,
            name,
            email: user.email,
            role: user.role,
            roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
            isActive: user.isActive,
            allowedPages: user.allowedPages || [],
            createdAt: user.createdAt,
        };
    },
    createUser: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        // ----- Auto / Manual ID assignment (before the transaction so duplicate
        // errors surface early; the manual path also bumps the role counter) -----
        let userIdCode;
        if (data.idMode === 'MANUAL' && data.customId?.trim()) {
            // Throws when the ID is already in use; bumps the counter if higher.
            userIdCode = await idGeneratorService_1.idGeneratorService.registerManualId(data.role, data.customId);
        }
        else {
            // AUTO (default): atomically claim the next ID for this role.
            userIdCode = await idGeneratorService_1.idGeneratorService.claimNextId(data.role);
        }
        // Create the user AND its role-specific profile row atomically so all
        // necessary tables are populated (data integrity).
        const user = await db_1.default.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    password: hashedPassword,
                    role: data.role,
                    roles: data.roles?.length ? data.roles : [data.role].filter(Boolean),
                    isActive: data.isActive,
                    allowedPages: data.allowedPages || [],
                    schoolId: tenantId, // 👈 required
                    userIdCode,
                },
            });
            if (created.role === 'TEACHER') {
                await tx.teacher.create({
                    data: {
                        name: data.name,
                        email: data.email,
                        phone: '',
                        userId: created.id,
                        schoolId: tenantId,
                    },
                });
            }
            else if (created.role === 'PARENT') {
                await tx.parent.create({
                    data: {
                        name: data.name,
                        email: data.email,
                        phone: '',
                        userId: created.id,
                        schoolId: tenantId,
                    },
                });
            }
            else if (created.role === 'STUDENT') {
                await tx.student.create({
                    data: {
                        name: data.name,
                        gender: '',
                        userId: created.id,
                        schoolId: tenantId,
                        admissionNumber: userIdCode,
                    },
                });
            }
            // Ensure profile rows exist for secondary roles too (e.g. a user with
            // roles = [ACCOUNTANT, TEACHER] needs a Teacher profile row even though
            // the primary role is ACCOUNTANT).
            await exports.userService.syncProfileRows(tx, created);
            return tx.user.findUnique({
                where: { id: created.id },
                include: {
                    student: true,
                    teacher: true,
                    parent: true,
                },
            });
        });
        if (!user)
            throw new Error('User creation failed');
        let displayName = data.name;
        if (user.role === 'STUDENT' && user.student)
            displayName = user.student.name;
        else if (user.role === 'TEACHER' && user.teacher)
            displayName = user.teacher.name;
        else if (user.role === 'PARENT' && user.parent)
            displayName = user.parent.name;
        return {
            id: user.id,
            name: displayName,
            email: user.email,
            role: user.role,
            roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
            isActive: user.isActive,
            allowedPages: user.allowedPages || [],
            userIdCode: user.userIdCode,
            createdAt: user.createdAt,
        };
    },
    updateUser: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updateData = { ...data };
        if (data.password) {
            updateData.password = await bcryptjs_1.default.hash(data.password, 10);
        }
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
        const user = await db_1.default.user.update({
            where: { id, schoolId: tenantId },
            data: updateData,
            include: {
                student: true,
                teacher: true,
                parent: true,
            },
        });
        // Roles may have changed — make sure profile rows exist for every role
        // now held (e.g. adding TEACHER to an accountant needs a Teacher profile
        // so the user appears on the Teachers page and can be given arms/subjects).
        await exports.userService.syncProfileRows(db_1.default, user);
        let displayName = user.name;
        if (user.role === 'STUDENT' && user.student)
            displayName = user.student.name;
        else if (user.role === 'TEACHER' && user.teacher)
            displayName = user.teacher.name;
        else if (user.role === 'PARENT' && user.parent)
            displayName = user.parent.name;
        return {
            id: user.id,
            name: displayName,
            email: user.email,
            role: user.role,
            roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
            isActive: user.isActive,
            allowedPages: user.allowedPages || [],
            createdAt: user.createdAt,
        };
    },
    deleteUser: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Delete dependent profile rows first so all related tables stay
        // consistent (Payroll cascades automatically).
        return db_1.default.$transaction(async (tx) => {
            const teacher = await tx.teacher.findUnique({ where: { userId: id } });
            if (teacher) {
                // Detach teacher from arms / subject-arms before removal
                await tx.arm.updateMany({
                    where: { teacherId: teacher.id, schoolId: tenantId },
                    data: { teacherId: null },
                });
                await tx.subjectArm.updateMany({
                    where: { teacherId: teacher.id, schoolId: tenantId },
                    data: { teacherId: null },
                });
                await tx.subjectTeacher.deleteMany({
                    where: { teacherId: teacher.id, schoolId: tenantId },
                });
                await tx.teacher.delete({ where: { id: teacher.id, schoolId: tenantId } });
            }
            const parent = await tx.parent.findUnique({ where: { userId: id } });
            if (parent) {
                // Detach children before removing the parent record
                await tx.student.updateMany({
                    where: { parentId: parent.id, schoolId: tenantId },
                    data: { parentId: null },
                });
                await tx.parent.delete({ where: { id: parent.id, schoolId: tenantId } });
            }
            const student = await tx.student.findUnique({ where: { userId: id } });
            if (student) {
                // Remove all records that reference the student before deleting
                // (same cleanup as studentService.deleteMany).
                await tx.attendance.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.studentPromotionHistory.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.result.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.feePayment.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.studentFee.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.testAttempt.deleteMany({ where: { studentId: student.id, schoolId: tenantId } });
                await tx.studentSubject.deleteMany({
                    where: { studentId: student.id, schoolId: tenantId },
                });
                await tx.student.delete({ where: { id: student.id, schoolId: tenantId } });
            }
            return tx.user.delete({
                where: { id, schoolId: tenantId },
            });
        });
    },
    deleteMany: async (ids) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        let deleted = 0;
        const failed = [];
        // Reuse the single-delete cleanup logic per user (each runs in its own
        // transaction) so dependent profile rows are handled consistently.
        for (const id of ids) {
            try {
                await exports.userService.deleteUser(id);
                deleted++;
            }
            catch {
                failed.push(id);
            }
        }
        return { deleted, failed };
    },
    updateStatus: async (id, isActive) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const user = await db_1.default.user.update({
            where: { id, schoolId: tenantId },
            data: { isActive },
            include: {
                student: true,
                teacher: true,
                parent: true,
            },
        });
        let displayName = user.name;
        if (user.role === 'STUDENT' && user.student)
            displayName = user.student.name;
        else if (user.role === 'TEACHER' && user.teacher)
            displayName = user.teacher.name;
        else if (user.role === 'PARENT' && user.parent)
            displayName = user.parent.name;
        return {
            id: user.id,
            name: displayName,
            email: user.email,
            role: user.role,
            roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
            isActive: user.isActive,
            allowedPages: user.allowedPages || [],
            createdAt: user.createdAt,
        };
    },
};
