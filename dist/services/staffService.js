"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffService = exports.buildStaffResponse = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const tenantContext_1 = require("../utils/tenantContext");
// ---------- Helper: build staff response ----------
const buildStaffResponse = async (user) => {
    let teacherData = null;
    if (user.role === 'TEACHER') {
        teacherData = await db_1.default.teacher.findUnique({
            where: { userId: user.id },
            include: {
                arms: { include: { class: true } },
                subjectArms: { include: { subject: true, arm: { include: { class: true } } } },
            },
        });
    }
    const staff = {
        id: user.id,
        name: user.name || '',
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
    };
    if (user.role === 'TEACHER' && teacherData) {
        const arms = teacherData.arms || [];
        const subjectArms = teacherData.subjectArms || [];
        staff.teacherType = arms.length > 0 ? 'class_teacher' :
            (subjectArms.length > 0 ? 'subject_teacher' : null);
        staff.assignedClass = arms[0]?.class?.name || null;
        staff.assignedSubjects = subjectArms.map((sa) => ({
            subject: sa.subject.name,
            class: sa.arm?.class?.name || '',
        }));
    }
    else {
        staff.teacherType = null;
        staff.assignedClass = null;
        staff.assignedSubjects = [];
    }
    return staff;
};
exports.buildStaffResponse = buildStaffResponse;
// Helper to safely parse assignedSubjects (for bulk upload)
const parseAssignedSubjects = (subjects) => {
    if (!subjects)
        return [];
    if (Array.isArray(subjects))
        return subjects;
    if (typeof subjects === 'string') {
        try {
            const parsed = JSON.parse(subjects);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
};
// ---------- Service ----------
exports.staffService = {
    // Get all staff (users with staff roles) – middleware adds schoolId
    getAllStaff: async () => {
        const STAFF_ROLES = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
        const users = await db_1.default.user.findMany({
            where: { role: { in: STAFF_ROLES } },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(users.map(exports.buildStaffResponse));
    },
    getStaffById: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const user = await db_1.default.user.findUnique({
            where: { id, schoolId: tenantId },
        });
        if (!user)
            return null;
        return (0, exports.buildStaffResponse)(user);
    },
    createStaff: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const { name, email, role, hashedPassword, teacherType, assignedClass, assignedSubjects } = data;
        const user = await db_1.default.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                isActive: true,
                schoolId: tenantId,
            },
        });
        if (role === 'TEACHER') {
            const teacher = await db_1.default.teacher.create({
                data: {
                    name: name || '',
                    email,
                    userId: user.id,
                    schoolId: tenantId,
                },
            });
            if (teacherType === 'class_teacher' && assignedClass) {
                const arm = await db_1.default.arm.findFirst({
                    where: { class: { name: assignedClass }, schoolId: tenantId },
                });
                if (arm) {
                    await db_1.default.arm.update({
                        where: { id: arm.id, schoolId: tenantId },
                        data: { teacherId: teacher.id },
                    });
                }
            }
            if (teacherType === 'subject_teacher' && assignedSubjects?.length) {
                for (const subj of assignedSubjects) {
                    const subject = await db_1.default.subject.findFirst({
                        where: { name: subj.subject, schoolId: tenantId },
                    });
                    const arm = await db_1.default.arm.findFirst({
                        where: { class: { name: subj.class }, schoolId: tenantId },
                    });
                    if (subject && arm) {
                        await db_1.default.subjectArm.create({
                            data: {
                                subjectId: subject.id,
                                armId: arm.id,
                                teacherId: teacher.id,
                                schoolId: tenantId,
                            },
                        });
                    }
                }
            }
        }
        return (0, exports.buildStaffResponse)(user);
    },
    updateStaff: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const { name, email, role, teacherType, assignedClass, assignedSubjects } = data;
        const user = await db_1.default.user.findUnique({
            where: { id, schoolId: tenantId },
        });
        if (!user)
            throw new Error('Staff not found');
        const userUpdateData = {};
        if (name !== undefined)
            userUpdateData.name = name;
        if (email !== undefined)
            userUpdateData.email = email;
        if (role !== undefined)
            userUpdateData.role = role;
        const updatedUser = await db_1.default.user.update({
            where: { id, schoolId: tenantId },
            data: userUpdateData,
        });
        // Handle teacher sync
        if (role === 'TEACHER') {
            let teacher = await db_1.default.teacher.findUnique({
                where: { userId: id, schoolId: tenantId },
            });
            if (!teacher) {
                teacher = await db_1.default.teacher.create({
                    data: {
                        name: (name !== undefined ? name : user.name) || '',
                        email: (email !== undefined ? email : user.email) || '',
                        userId: id,
                        schoolId: tenantId,
                    },
                });
            }
            else {
                const teacherUpdateData = {};
                if (name !== undefined)
                    teacherUpdateData.name = name;
                if (email !== undefined)
                    teacherUpdateData.email = email;
                if (Object.keys(teacherUpdateData).length > 0) {
                    teacher = await db_1.default.teacher.update({
                        where: { id: teacher.id, schoolId: tenantId },
                        data: teacherUpdateData,
                    });
                }
            }
            // Clear existing assignments (tenant-scoped)
            await db_1.default.arm.updateMany({
                where: { teacherId: teacher.id, schoolId: tenantId },
                data: { teacherId: null },
            });
            await db_1.default.subjectArm.deleteMany({
                where: { teacherId: teacher.id, schoolId: tenantId },
            });
            // Class teacher assignment
            if (teacherType === 'class_teacher' && assignedClass) {
                const arm = await db_1.default.arm.findFirst({
                    where: { class: { name: assignedClass }, schoolId: tenantId },
                });
                if (arm) {
                    await db_1.default.arm.update({
                        where: { id: arm.id, schoolId: tenantId },
                        data: { teacherId: teacher.id },
                    });
                }
            }
            // Subject teacher assignments
            if (teacherType === 'subject_teacher' && assignedSubjects?.length) {
                for (const subj of assignedSubjects) {
                    const subject = await db_1.default.subject.findFirst({
                        where: { name: subj.subject, schoolId: tenantId },
                    });
                    const arm = await db_1.default.arm.findFirst({
                        where: { class: { name: subj.class }, schoolId: tenantId },
                    });
                    if (subject && arm) {
                        await db_1.default.subjectArm.create({
                            data: {
                                subjectId: subject.id,
                                armId: arm.id,
                                teacherId: teacher.id,
                                schoolId: tenantId,
                            },
                        });
                    }
                }
            }
        }
        else {
            // If role changed from TEACHER, delete teacher record (tenant-scoped)
            const teacher = await db_1.default.teacher.findUnique({
                where: { userId: id, schoolId: tenantId },
            });
            if (teacher) {
                await db_1.default.teacher.delete({
                    where: { id: teacher.id, schoolId: tenantId },
                });
            }
        }
        return (0, exports.buildStaffResponse)(updatedUser);
    },
    deleteStaff: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const user = await db_1.default.user.findUnique({
            where: { id, schoolId: tenantId },
        });
        if (!user)
            throw new Error('Staff not found');
        if (user.role === 'TEACHER') {
            const teacher = await db_1.default.teacher.findUnique({
                where: { userId: id, schoolId: tenantId },
            });
            if (teacher) {
                await db_1.default.teacher.delete({
                    where: { id: teacher.id, schoolId: tenantId },
                });
            }
        }
        await db_1.default.user.delete({
            where: { id, schoolId: tenantId },
        });
        return { message: 'Staff deleted successfully' };
    },
    bulkCreateStaff: async (rows) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const results = {
            created: [],
            errors: [],
        };
        const STAFF_ROLES = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
        const roleMap = {
            Principal: 'PRINCIPAL',
            Teacher: 'TEACHER',
            Accountant: 'ACCOUNTANT',
            Admin: 'ADMIN',
            Librarian: 'LIBRARIAN',
            Bursar: 'BURSAR',
        };
        for (const row of rows) {
            try {
                const { name, email, role, teacherType, assignedClass, assignedSubjects } = row;
                if (!name || !email || !role) {
                    results.errors.push({ row, error: 'Missing required fields' });
                    continue;
                }
                const enumRole = roleMap[role];
                if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
                    results.errors.push({ row, error: 'Invalid role' });
                    continue;
                }
                const hashedPassword = await bcrypt_1.default.hash('password123', 10);
                const subjectsArray = parseAssignedSubjects(assignedSubjects);
                const user = await exports.staffService.createStaff({
                    name,
                    email,
                    role: enumRole,
                    hashedPassword,
                    teacherType,
                    assignedClass,
                    assignedSubjects: subjectsArray,
                });
                results.created.push(user);
            }
            catch (err) {
                results.errors.push({ row, error: err.message });
            }
        }
        return results;
    },
};
