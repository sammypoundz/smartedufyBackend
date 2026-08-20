"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.attendanceService = {
    /**
     * Get attendance records for a specific student.
     * @param studentId - The student ID
     * @returns Array of { date, present } records ordered by date descending
     */
    getByStudentId: (studentId) => db_1.default.attendance.findMany({
        where: { studentId }, // middleware adds schoolId
        select: { date: true, present: true },
        orderBy: { date: 'desc' },
    }),
    /**
     * Get attendance records for a specific arm, optionally filtered by date range.
     * @param armId - The arm ID
     * @param startDate - Optional start date (inclusive)
     * @param endDate - Optional end date (inclusive)
     * @returns Array of attendance records (without student details, only studentId and date)
     */
    getByArmAndDateRange: (armId, startDate, endDate) => {
        const where = { student: { armId } };
        if (startDate || endDate) {
            where.date = {};
            if (startDate)
                where.date.gte = startDate;
            if (endDate)
                where.date.lte = endDate;
        }
        return db_1.default.attendance.findMany({
            where,
            select: { studentId: true, date: true, present: true },
            orderBy: { date: 'asc' },
        }); // middleware adds schoolId to the Attendance model
    },
    /**
     * Legacy: Get attendance for a specific arm, optionally filtered by exact date.
     * Returns records with student details.
     * @deprecated Use getByArmAndDateRange instead.
     */
    getByArmAndDate: (armId, date) => {
        const where = { student: { armId } };
        if (date)
            where.date = date;
        return db_1.default.attendance.findMany({
            where,
            include: { student: true },
            orderBy: { date: 'desc' },
        }); // middleware adds schoolId
    },
    /**
     * Save attendance for multiple students in an arm on a given date.
     * Uses upsert (update if exists, create otherwise).
     * @param armId - The arm ID (used to validate that students belong to this arm)
     * @param date - The date of attendance
     * @param records - Array of { studentId, present }
     * @returns Array of upserted attendance records
     */
    saveBulkForArm: async (armId, date, records) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Verify all studentIds belong to the given arm and tenant
        const studentIds = records.map(r => r.studentId);
        const validStudents = await db_1.default.student.findMany({
            where: {
                id: { in: studentIds },
                armId,
                schoolId: tenantId, // ensure tenant scope
            },
            select: { id: true },
        });
        const validIds = new Set(validStudents.map(s => s.id));
        const invalid = records.filter(r => !validIds.has(r.studentId));
        if (invalid.length) {
            throw new Error(`Students ${invalid.map(i => i.studentId).join(', ')} do not belong to this arm`);
        }
        // Upsert each record
        const results = await Promise.all(records.map(record => db_1.default.attendance.upsert({
            where: {
                studentId_date: {
                    studentId: record.studentId,
                    date: date,
                },
            },
            update: { present: record.present },
            create: {
                studentId: record.studentId,
                date: date,
                present: record.present,
                schoolId: tenantId, // 👈 required for create
            },
        })));
        return results;
    },
    /**
     * Legacy: Mark attendance for multiple students on a given date.
     * Deletes existing records for these students on the same date, then creates new ones.
     * Does NOT validate arm membership.
     * @deprecated Use saveBulkForArm instead.
     */
    markBulk: async (date, records) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const studentIds = records.map(r => r.studentId);
        await db_1.default.attendance.deleteMany({
            where: {
                date,
                studentId: { in: studentIds },
                // middleware adds schoolId to where
            },
        });
        return Promise.all(records.map(record => db_1.default.attendance.create({
            data: {
                date,
                studentId: record.studentId,
                present: record.present,
                schoolId: tenantId, // 👈 required for create
            },
        })));
    },
    /**
     * Update a single attendance record (by its ID).
     * @param id - Attendance record ID
     * @param present - New present status
     * @returns Updated attendance record
     */
    update: (id, present) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.attendance.update({
            where: { id, schoolId: tenantId }, // ensure tenant scope
            data: { present },
        });
    },
    /**
     * Delete a single attendance record.
     * @param id - Attendance record ID
     */
    delete: (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.attendance.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
