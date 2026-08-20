"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timetableService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.timetableService = {
    // Arm ID must be a non‑null string (caller must validate)
    getByArmId: (armId) => {
        return db_1.default.timetableEntry.findMany({
            where: { armId },
            include: { subject: true },
            orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
        }); // middleware adds schoolId
    },
    getByTeacherId: async (teacherId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const teacherSubjects = await db_1.default.subjectArm.findMany({
            where: { teacherId, schoolId: tenantId },
            select: { armId: true, subjectId: true },
        });
        if (teacherSubjects.length === 0)
            return [];
        const orConditions = teacherSubjects.map(ts => ({
            AND: [{ armId: ts.armId }, { subjectId: ts.subjectId }],
        }));
        const entries = await db_1.default.timetableEntry.findMany({
            where: {
                OR: orConditions,
                // schoolId is added by middleware, but we can add it explicitly if needed
            },
            include: {
                subject: true,
                arm: { include: { class: true } },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
        });
        return Array.from(new Map(entries.map(e => [e.id, e])).values());
    },
    replaceForArm: async (armId, entries) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const subjectIds = entries
            .map(e => e.subjectId)
            .filter((id) => !!id);
        if (subjectIds.length === 0) {
            await db_1.default.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
            return [];
        }
        const subjectArms = await db_1.default.subjectArm.findMany({
            where: { armId, subjectId: { in: subjectIds }, schoolId: tenantId },
            select: { subjectId: true, teacherId: true },
        });
        const teacherMap = new Map();
        for (const sa of subjectArms) {
            if (sa.teacherId)
                teacherMap.set(sa.subjectId, sa.teacherId);
        }
        const teacherIds = Array.from(new Set(teacherMap.values()));
        if (teacherIds.length === 0) {
            await db_1.default.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
            const createdEntries = [];
            for (const entry of entries) {
                const created = await db_1.default.timetableEntry.create({
                    data: {
                        armId,
                        dayOfWeek: entry.dayOfWeek,
                        timeSlot: entry.timeSlot,
                        subjectId: entry.subjectId ?? null,
                        schoolId: tenantId,
                    },
                });
                createdEntries.push(created);
            }
            return createdEntries;
        }
        const teacherSubjectArms = await db_1.default.subjectArm.findMany({
            where: { teacherId: { in: teacherIds }, schoolId: tenantId },
            select: { armId: true, subjectId: true, teacherId: true },
        });
        const teacherArmSubjectMap = new Map();
        for (const tsa of teacherSubjectArms) {
            teacherArmSubjectMap.set(`${tsa.armId}|${tsa.subjectId}`, { teacherId: tsa.teacherId });
        }
        const affectedArmIds = Array.from(new Set(teacherSubjectArms.map(tsa => tsa.armId)));
        // Only get entries from the same tenant (middleware will add schoolId, but we add explicitly)
        const existingEntries = await db_1.default.timetableEntry.findMany({
            where: {
                armId: { in: affectedArmIds },
                schoolId: tenantId,
            },
        });
        const existingConflictSet = new Set();
        for (const entry of existingEntries) {
            const key = `${entry.armId}|${entry.subjectId}`;
            const mapping = teacherArmSubjectMap.get(key);
            if (mapping?.teacherId && entry.armId !== armId) {
                existingConflictSet.add(`${mapping.teacherId}|${entry.dayOfWeek}|${entry.timeSlot}`);
            }
        }
        for (const entry of entries) {
            if (!entry.subjectId)
                continue;
            const teacherId = teacherMap.get(entry.subjectId);
            if (!teacherId)
                continue;
            const conflictKey = `${teacherId}|${entry.dayOfWeek}|${entry.timeSlot}`;
            if (existingConflictSet.has(conflictKey)) {
                throw new Error(`Teacher conflict: Teacher ${teacherId} already has a lesson at ${entry.dayOfWeek} ${entry.timeSlot} in another arm.`);
            }
        }
        await db_1.default.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
        const createdEntries = [];
        for (const entry of entries) {
            const created = await db_1.default.timetableEntry.create({
                data: {
                    armId,
                    dayOfWeek: entry.dayOfWeek,
                    timeSlot: entry.timeSlot,
                    subjectId: entry.subjectId ?? null,
                    schoolId: tenantId,
                },
            });
            createdEntries.push(created);
        }
        return createdEntries;
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.timetableEntry.update({
            where: { id, schoolId: tenantId },
            data: {
                dayOfWeek: data.dayOfWeek,
                timeSlot: data.timeSlot,
                subjectId: data.subjectId,
            },
            include: { subject: true },
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.timetableEntry.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
