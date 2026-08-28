"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.armService = exports.classService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.classService = {
    /**
     * Get all classes with arms, each arm including its teacher and student count.
     */
    getAll: () => db_1.default.class.findMany({
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
        },
    }), // middleware adds schoolId
    /**
     * Get a single class by ID, including arms with teacher and student count.
     */
    getById: (id) => db_1.default.class.findUnique({
        where: { id }, // middleware adds schoolId
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
        },
    }),
    /**
     * Create a new class.
     */
    create: async (name) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.class.create({
            data: { name, schoolId: tenantId },
        });
    },
    /**
     * Update a class name.
     */
    update: async (id, name) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.class.update({
            where: { id, schoolId: tenantId },
            data: { name },
        });
    },
    /**
     * Delete a class and all its dependent data (arms, students, attendance, results, etc.).
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // 1. Get all arm IDs for this class, ensuring they belong to the tenant
        const arms = await db_1.default.arm.findMany({
            where: { classId: id, schoolId: tenantId },
            select: { id: true },
        });
        const armIds = arms.map(arm => arm.id);
        // 2. Get all student IDs for these arms
        let studentIds = [];
        if (armIds.length > 0) {
            const students = await db_1.default.student.findMany({
                where: { armId: { in: armIds }, schoolId: tenantId },
                select: { id: true },
            });
            studentIds = students.map(student => student.id);
        }
        // 3. Delete records that depend on students
        if (studentIds.length > 0) {
            await db_1.default.attendance.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.studentSubject.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.result.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.student.deleteMany({
                where: { id: { in: studentIds }, schoolId: tenantId },
            });
        }
        // 4. Delete records that depend on arms
        if (armIds.length > 0) {
            await db_1.default.timetableEntry.deleteMany({
                where: { armId: { in: armIds }, schoolId: tenantId },
            });
            await db_1.default.armSkill.deleteMany({
                where: { armId: { in: armIds }, schoolId: tenantId },
            });
            await db_1.default.subjectArm.deleteMany({
                where: { armId: { in: armIds }, schoolId: tenantId },
            });
            await db_1.default.arm.deleteMany({
                where: { id: { in: armIds }, schoolId: tenantId },
            });
        }
        // 5. Finally delete the class
        return db_1.default.class.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
// ----------------------------------------------------------------------
// Arm service – separate CRUD operations for arms (used by frontend)
// ----------------------------------------------------------------------
exports.armService = {
    /**
     * Create a new arm under a class.
     */
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.arm.create({
            data: {
                letter: data.letter,
                alias: data.alias,
                classId: data.classId,
                teacherId: data.teacherId,
                schoolId: tenantId,
            },
            include: {
                teacher: {
                    select: { id: true, name: true, email: true, phone: true },
                },
                _count: {
                    select: { students: true },
                },
            },
        });
    },
    /**
     * Update an existing arm (partial update).
     */
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.arm.update({
            where: { id, schoolId: tenantId },
            data,
            include: {
                teacher: {
                    select: { id: true, name: true, email: true, phone: true },
                },
                _count: {
                    select: { students: true },
                },
            },
        });
    },
    /**
     * Delete an arm – also removes all dependent data (students, results, etc.).
     * Note: The frontend may want to handle cascading deletes manually or rely on
     * Prisma's `onDelete: Cascade` in the schema. This service provides a manual
     * cascade for safety.
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // 1. Get all students in this arm, ensuring they belong to the tenant
        const students = await db_1.default.student.findMany({
            where: { armId: id, schoolId: tenantId },
            select: { id: true },
        });
        const studentIds = students.map(s => s.id);
        // 2. Delete student-dependent records
        if (studentIds.length > 0) {
            await db_1.default.attendance.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.studentSubject.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.result.deleteMany({
                where: { studentId: { in: studentIds }, schoolId: tenantId },
            });
            await db_1.default.student.deleteMany({
                where: { id: { in: studentIds }, schoolId: tenantId },
            });
        }
        // 3. Delete arm-dependent records
        await db_1.default.timetableEntry.deleteMany({
            where: { armId: id, schoolId: tenantId },
        });
        await db_1.default.armSkill.deleteMany({
            where: { armId: id, schoolId: tenantId },
        });
        await db_1.default.subjectArm.deleteMany({
            where: { armId: id, schoolId: tenantId },
        });
        // 4. Finally delete the arm
        return db_1.default.arm.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
