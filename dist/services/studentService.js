"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentService = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantContext_1 = require("../utils/tenantContext");
exports.studentService = {
    // ---------- Existing methods ----------
    getAll: async (armId) => {
        const where = {};
        if (armId)
            where.armId = armId;
        return db_1.default.student.findMany({
            where,
            include: { parent: true, class: true, arm: true, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getByArmId: (armId) => {
        if (!armId)
            throw new Error('Arm ID is required');
        return db_1.default.student.findMany({
            where: { armId },
            include: { parent: true, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getByClassId: (classId) => {
        if (!classId)
            throw new Error('Class ID is required');
        return db_1.default.student.findMany({
            where: { classId },
            include: { parent: true, arm: true, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getById: (id) => {
        if (!id)
            throw new Error('Student ID is required');
        return db_1.default.student.findUnique({
            where: { id },
            include: { parent: true, class: true, arm: true, attendance: true, results: true },
        }); // middleware adds schoolId
    },
    getByUserId: (userId) => {
        if (!userId)
            throw new Error('User ID is required');
        return db_1.default.student.findUnique({
            where: { userId },
            include: {
                arm: { include: { class: true } },
                user: { select: { email: true, role: true } },
                parent: true,
            },
        }); // middleware adds schoolId
    },
    findByAdmissionAndArm: (admissionNumber, armId) => {
        return db_1.default.student.findFirst({
            where: { admissionNumber, armId },
            include: { arm: { include: { class: true } } },
        }); // middleware adds schoolId
    },
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const email = `${data.name.toLowerCase().replace(/\s/g, '.')}@student.smartedufy.com`;
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
        const user = await db_1.default.user.create({
            data: {
                name: data.name,
                email,
                password: hashedPassword,
                role: 'STUDENT',
                isActive: true,
                schoolId: tenantId,
            },
        });
        return db_1.default.student.create({
            data: {
                name: data.name,
                gender: data.gender || '',
                admissionNumber: data.admissionNumber,
                classId: data.classId,
                armId: data.armId,
                userId: user.id,
                schoolId: tenantId,
            },
            include: { parent: true },
        });
    },
    async createParentWithUser(parentData) {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        let user = await db_1.default.user.findUnique({ where: { email: parentData.email } });
        if (!user) {
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
            user = await db_1.default.user.create({
                data: {
                    name: parentData.name,
                    email: parentData.email,
                    password: hashedPassword,
                    role: 'PARENT',
                    isActive: true,
                    schoolId: tenantId,
                },
            });
        }
        // Ensure parent record belongs to tenant
        const existingParent = await db_1.default.parent.findUnique({
            where: { userId: user.id },
        });
        if (existingParent)
            return existingParent;
        return db_1.default.parent.create({
            data: {
                userId: user.id,
                name: parentData.name,
                email: parentData.email,
                phone: parentData.phone || '',
                schoolId: tenantId,
            },
        });
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!id)
            throw new Error('Student ID is required');
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.gender !== undefined)
            updateData.gender = data.gender;
        if (data.dateOfBirth !== undefined)
            updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
        if (data.address !== undefined)
            updateData.address = data.address;
        if (data.admissionNumber !== undefined)
            updateData.admissionNumber = data.admissionNumber;
        if (data.classId !== undefined)
            updateData.classId = data.classId;
        if (data.armId !== undefined)
            updateData.armId = data.armId;
        if (data.guardianRelationship !== undefined)
            updateData.guardianRelationship = data.guardianRelationship;
        if (data.isActive !== undefined)
            updateData.isActive = data.isActive;
        // Handle parentId – allow null, empty string, or valid ID
        if (data.parentId !== undefined) {
            if (data.parentId) {
                const parentExists = await db_1.default.parent.findFirst({
                    where: { id: data.parentId, schoolId: tenantId },
                });
                if (!parentExists)
                    throw new Error('Parent not found in this tenant');
            }
            updateData.parentId = data.parentId;
        }
        if (data.newParent) {
            const newParent = await exports.studentService.createParentWithUser(data.newParent);
            updateData.parentId = newParent.id;
        }
        return db_1.default.student.update({
            where: { id, schoolId: tenantId },
            data: updateData,
            include: { parent: true, class: true, arm: true },
        });
    },
    assignParent: async (studentId, parentId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!studentId)
            throw new Error('Student ID is required');
        // Verify parent belongs to tenant
        const parentExists = await db_1.default.parent.findFirst({
            where: { id: parentId, schoolId: tenantId },
        });
        if (!parentExists)
            throw new Error('Parent not found in this tenant');
        return db_1.default.student.update({
            where: { id: studentId, schoolId: tenantId },
            data: { parentId },
            include: { parent: true },
        });
    },
    unassignParent: async (studentId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.student.update({
            where: { id: studentId, schoolId: tenantId },
            data: { parentId: null },
            include: { parent: true },
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!id)
            throw new Error('Student ID is required');
        await db_1.default.studentSubject.deleteMany({
            where: { studentId: id, schoolId: tenantId },
        });
        return db_1.default.student.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // ---------- Additional methods ----------
    getAllParents: () => db_1.default.parent.findMany({
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: 'asc' },
    }), // middleware adds schoolId
    createParent: async (data) => {
        return exports.studentService.createParentWithUser(data);
    },
    getStudentSubjects: async (studentId) => {
        const links = await db_1.default.studentSubject.findMany({
            where: { studentId },
            include: { subject: true },
        }); // middleware adds schoolId
        return links.map(link => link.subject);
    },
    updateStudentSubjects: async (studentId, subjectIds) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await db_1.default.studentSubject.deleteMany({
            where: { studentId, schoolId: tenantId },
        });
        if (subjectIds.length > 0) {
            await db_1.default.studentSubject.createMany({
                data: subjectIds.map(subjectId => ({
                    studentId,
                    subjectId,
                    schoolId: tenantId,
                })),
            });
        }
        return exports.studentService.getStudentSubjects(studentId);
    },
    getStudentAttendance: (studentId) => db_1.default.attendance.findMany({
        where: { studentId },
        select: { date: true, present: true },
        orderBy: { date: 'desc' },
    }), // middleware adds schoolId
    getStudentFees: async (studentId) => {
        try {
            return [];
        }
        catch {
            return [];
        }
    },
    getStudentResults: async (studentId) => {
        const results = await db_1.default.result.findMany({
            where: { studentId },
            include: { subject: true },
            orderBy: [{ term: 'desc' }, { subject: { name: 'asc' } }],
        }); // middleware adds schoolId
        return results.map(result => ({
            subject: result.subject.name,
            score: result.score,
            grade: result.grade || '',
            term: result.term,
        }));
    },
};
