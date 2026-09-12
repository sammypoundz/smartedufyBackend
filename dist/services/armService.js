"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.armService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
const syncService_1 = require("./syncService");
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
        // Integrity: validate all referenced entities belong to this school
        await syncService_1.syncService.validateSubjectArmLink(tenantId, subjectId, armId, teacherId);
        // Idempotent link: never create duplicates
        const existing = await db_1.default.subjectArm.findFirst({
            where: { armId, subjectId, schoolId: tenantId },
        });
        if (existing) {
            return db_1.default.subjectArm.update({
                where: { id: existing.id, schoolId: tenantId },
                data: { teacherId: teacherId ?? existing.teacherId },
                include: { subject: true, teacher: true },
            });
        }
        const link = await db_1.default.subjectArm.create({
            data: {
                armId,
                subjectId,
                teacherId,
                schoolId: tenantId,
            },
            include: { subject: true, teacher: true },
        });
        // Keep SubjectTeacher join table in sync
        if (teacherId) {
            await syncService_1.syncService.ensureSubjectTeacher(db_1.default, tenantId, subjectId, teacherId);
        }
        // Enroll students of this arm into the newly offered subject
        await syncService_1.syncService.syncStudentSubjectsForArm(tenantId, armId);
        return link;
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
        if (teacherId) {
            const teacher = await db_1.default.teacher.findFirst({ where: { id: teacherId, schoolId: tenantId } });
            if (!teacher)
                throw new Error('Teacher not found in this school');
        }
        const updated = await db_1.default.subjectArm.update({
            where: { id: relation.id, schoolId: tenantId },
            data: { teacherId: teacherId || null },
            include: { subject: true, teacher: true },
        });
        // Sync SubjectTeacher join table both ways (add new, prune old)
        if (teacherId) {
            await syncService_1.syncService.ensureSubjectTeacher(db_1.default, tenantId, subjectId, teacherId);
        }
        if (relation.teacherId && relation.teacherId !== teacherId) {
            await syncService_1.syncService.pruneSubjectTeachers(db_1.default, tenantId, subjectId, relation.teacherId);
        }
        return updated;
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
        const removed = await db_1.default.subjectArm.delete({
            where: { id: relation.id, schoolId: tenantId },
        });
        // Prune now-orphaned SubjectTeacher link
        if (relation.teacherId) {
            await syncService_1.syncService.pruneSubjectTeachers(db_1.default, tenantId, subjectId, relation.teacherId);
        }
        // Un-enroll students of this arm from the removed subject
        await db_1.default.studentSubject.deleteMany({
            where: { schoolId: tenantId, subjectId, student: { armId } },
        });
        return removed;
    },
    // Delete a subject-arm relation directly by its ID (used to remove a subject from a teacher)
    deleteSubjectArm: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const relation = await db_1.default.subjectArm.findFirst({
            where: { id, schoolId: tenantId },
        });
        if (!relation)
            throw new Error('Subject-arm relation not found');
        const removed = await db_1.default.subjectArm.delete({ where: { id, schoolId: tenantId } });
        if (relation.teacherId) {
            await syncService_1.syncService.pruneSubjectTeachers(db_1.default, tenantId, relation.subjectId, relation.teacherId);
        }
        await db_1.default.studentSubject.deleteMany({
            where: { schoolId: tenantId, subjectId: relation.subjectId, student: { armId: relation.armId } },
        });
        return removed;
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
