"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.armService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.armService = {
    // Get all arms for a specific class, including teacher, students (with parent), subjects, and skills
    getByClassId: (classId) => db_1.default.arm.findMany({
        where: { classId }, // middleware adds schoolId automatically
        include: {
            teacher: true,
            students: {
                include: { parent: true },
            },
            subjects: {
                include: {
                    subject: true,
                    teacher: true,
                },
            },
            skills: {
                include: { skill: true },
            },
        },
    }),
    // Get a single arm by ID, including teacher, students (with parent), subjects, and skills
    getById: (id) => db_1.default.arm.findUnique({
        where: { id }, // middleware adds schoolId automatically
        include: {
            teacher: true,
            students: {
                include: { parent: true },
            },
            subjects: {
                include: {
                    subject: true,
                    teacher: true,
                },
            },
            skills: {
                include: { skill: true },
            },
        },
    }),
    // Get all arms with class relation (for teacher dropdowns)
    getAll: () => db_1.default.arm.findMany({
        include: { class: true },
        orderBy: { class: { name: 'asc' } },
    }), // middleware adds schoolId
    // Create a new arm
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.arm.create({
            data: {
                ...data,
                schoolId: tenantId,
            },
            include: { teacher: true, students: true },
        });
    },
    // Update an arm
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updateData = {};
        if (data.letter !== undefined)
            updateData.letter = data.letter;
        if (data.alias !== undefined)
            updateData.alias = data.alias;
        if (data.teacherId !== undefined)
            updateData.teacherId = data.teacherId;
        return db_1.default.arm.update({
            where: { id, schoolId: tenantId },
            data: updateData,
            include: { teacher: true, students: true },
        });
    },
    // Delete an arm
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.arm.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // Add a subject to an arm
    addSubjectToArm: async (armId, subjectId, teacherId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.create({
            data: {
                armId,
                subjectId,
                teacherId,
                schoolId: tenantId,
            },
            include: { subject: true, teacher: true },
        });
    },
    // Add a skill to an arm
    addSkillToArm: async (armId, skillId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.armSkill.create({
            data: {
                armId,
                skillId,
                schoolId: tenantId,
            },
            include: { skill: true },
        });
    },
    // ---------- Methods for subject management ----------
    // Get all subjects assigned to an arm (with subject and teacher details)
    getArmSubjects: (armId) => db_1.default.subjectArm.findMany({
        where: { armId }, // middleware adds schoolId
        include: {
            subject: true,
            teacher: true,
        },
        orderBy: { subject: { name: 'asc' } },
    }),
    // Get only the subjects (without teacher details) – used by results page
    getSubjectsByArmId: (armId) => db_1.default.subjectArm.findMany({
        where: { armId }, // middleware adds schoolId
        select: {
            subject: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: { subject: { name: 'asc' } },
    }).then(subjectArms => subjectArms.map(sa => sa.subject)),
    // Update the teacher for a specific arm‑subject relation
    updateArmSubjectTeacher: async (armId, subjectId, teacherId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const relation = await db_1.default.subjectArm.findFirst({
            where: { armId, subjectId, schoolId: tenantId },
        });
        if (!relation)
            return null;
        return db_1.default.subjectArm.update({
            where: { id: relation.id, schoolId: tenantId },
            data: { teacherId: teacherId || null },
            include: { subject: true, teacher: true },
        });
    },
    // Remove a subject from an arm (by armId and subjectId)
    removeArmSubject: async (armId, subjectId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const relation = await db_1.default.subjectArm.findFirst({
            where: { armId, subjectId, schoolId: tenantId },
        });
        if (!relation)
            return null;
        return db_1.default.subjectArm.delete({
            where: { id: relation.id, schoolId: tenantId },
        });
    },
    // Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
    deleteSubjectArm: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // ---------- Methods for student management (results page) ----------
    // Get all students in an arm (basic info: id, name, admissionNumber)
    getStudentsByArmId: (armId) => db_1.default.student.findMany({
        where: { armId }, // middleware adds schoolId
        select: {
            id: true,
            name: true,
            admissionNumber: true,
        },
        orderBy: { name: 'asc' },
    }),
};
