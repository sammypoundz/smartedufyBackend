"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
/**
 * syncService — guarantees referential & logical consistency between
 * Subject, SubjectArm (subject offered in an arm/class), SubjectTeacher
 * (teacher teaches subject) and StudentSubject (student takes subject).
 */
exports.syncService = {
    /** Ensure a SubjectTeacher row exists for (subjectId, teacherId). */
    ensureSubjectTeacher: async (tx, schoolId, subjectId, teacherId) => {
        const existing = await tx.subjectTeacher.findFirst({
            where: { schoolId, subjectId, teacherId },
        });
        if (existing)
            return existing;
        return tx.subjectTeacher.create({
            data: { schoolId, subjectId, teacherId },
        });
    },
    /** Remove SubjectTeacher rows for a subject that have no SubjectArm link anymore. */
    pruneSubjectTeachers: async (tx, schoolId, subjectId, teacherId) => {
        const stillTeaches = await tx.subjectArm.findFirst({
            where: { schoolId, subjectId, teacherId },
        });
        if (!stillTeaches) {
            await tx.subjectTeacher.deleteMany({
                where: { schoolId, subjectId, teacherId },
            });
        }
    },
    /** Sync every SubjectArm.teacherId into the SubjectTeacher join table. */
    syncSubjectTeachersForSubject: async (schoolId, subjectId) => {
        await db_1.default.$transaction(async (tx) => {
            const links = await tx.subjectArm.findMany({
                where: { schoolId, subjectId, teacherId: { not: null } },
                select: { teacherId: true },
            });
            const teacherIds = [
                ...new Set(links.map((l) => String(l.teacherId))),
            ];
            for (const teacherId of teacherIds) {
                await exports.syncService.ensureSubjectTeacher(tx, schoolId, subjectId, teacherId);
            }
            // Remove SubjectTeacher rows pointing at teachers no longer linked
            const stale = await tx.subjectTeacher.findMany({
                where: { schoolId, subjectId },
                select: { teacherId: true },
            });
            for (const st of stale) {
                if (!teacherIds.includes(st.teacherId)) {
                    await tx.subjectTeacher.deleteMany({
                        where: { schoolId, subjectId, teacherId: st.teacherId },
                    });
                }
            }
        });
    },
    /**
     * Sync StudentSubject with the subjects offered in the student's arm.
     * - Adds missing subjects offered in the arm.
     * - Removes subjects no longer offered in the arm.
     */
    syncStudentSubjectsForStudent: async (schoolId, studentId) => {
        const student = await db_1.default.student.findFirst({
            where: { id: studentId, schoolId },
            select: { armId: true },
        });
        if (!student?.armId)
            return;
        const armSubjectIds = (await db_1.default.subjectArm.findMany({
            where: { schoolId, armId: student.armId },
            select: { subjectId: true },
        })).map((sa) => sa.subjectId);
        const current = (await db_1.default.studentSubject.findMany({
            where: { schoolId, studentId },
            select: { subjectId: true },
        })).map((ss) => ss.subjectId);
        const toAdd = armSubjectIds.filter((id) => !current.includes(id));
        const toRemove = current.filter((id) => !armSubjectIds.includes(id));
        if (toAdd.length) {
            await db_1.default.studentSubject.createMany({
                data: toAdd.map((subjectId) => ({ schoolId, studentId, subjectId })),
            });
        }
        if (toRemove.length) {
            await db_1.default.studentSubject.deleteMany({
                where: { schoolId, studentId, subjectId: { in: toRemove } },
            });
        }
    },
    /** Sync StudentSubject for every student in an arm. */
    syncStudentSubjectsForArm: async (schoolId, armId) => {
        const students = await db_1.default.student.findMany({
            where: { schoolId, armId },
            select: { id: true },
        });
        for (const s of students) {
            await exports.syncService.syncStudentSubjectsForStudent(schoolId, s.id);
        }
    },
    /**
     * Validate a link triple before creating a SubjectArm row.
     * Throws if subject/arm/teacher don't exist or belong to another school.
     */
    validateSubjectArmLink: async (schoolId, subjectId, armId, teacherId) => {
        const subject = await db_1.default.subject.findFirst({
            where: { id: subjectId, schoolId },
        });
        if (!subject)
            throw new Error("Subject not found in this school");
        const arm = await db_1.default.arm.findFirst({ where: { id: armId, schoolId } });
        if (!arm)
            throw new Error("Arm not found in this school");
        if (teacherId) {
            const teacher = await db_1.default.teacher.findFirst({
                where: { id: teacherId, schoolId },
            });
            if (!teacher)
                throw new Error("Teacher not found in this school");
        }
    },
    /**
     * Full system audit & repair: dedupes join tables, syncs
     * SubjectTeacher and StudentSubject records for the current tenant.
     */
    reconcileAll: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const schoolId = tenantId;
        const report = {
            duplicateSubjectArmsRemoved: 0,
            duplicateSubjectTeachersRemoved: 0,
            subjectTeacherLinksCreated: 0,
            subjectTeacherLinksPruned: 0,
            studentSubjectLinksAdded: 0,
            studentSubjectLinksRemoved: 0,
            orphanStudentSubjectsRemoved: 0,
        };
        // 1. Dedupe SubjectArm rows (schoolId, subjectId, armId)
        const allSubjectArms = await db_1.default.subjectArm.findMany({
            where: { schoolId },
        });
        const seenArms = new Set();
        for (const sa of allSubjectArms) {
            const key = `${sa.subjectId}|${sa.armId}`;
            if (seenArms.has(key)) {
                await db_1.default.subjectArm.delete({ where: { id: sa.id } });
                report.duplicateSubjectArmsRemoved++;
            }
            else {
                seenArms.add(key);
            }
        }
        // 2. Remove SubjectTeacher duplicates (subjectId, teacherId)
        const allSubjectTeachers = await db_1.default.subjectTeacher.findMany({
            where: { schoolId },
        });
        const seenST = new Set();
        for (const st of allSubjectTeachers) {
            const key = `${st.subjectId}|${st.teacherId}`;
            if (seenST.has(key)) {
                await db_1.default.subjectTeacher.delete({ where: { id: st.id } });
                report.duplicateSubjectTeachersRemoved++;
            }
            else {
                seenST.add(key);
            }
        }
        // 3. Rebuild SubjectTeacher from SubjectArm
        const armsAfter = await db_1.default.subjectArm.findMany({ where: { schoolId } });
        const expected = new Map();
        for (const sa of armsAfter) {
            if (!sa.teacherId)
                continue;
            if (!expected.has(sa.subjectId))
                expected.set(sa.subjectId, new Set());
            expected.get(sa.subjectId).add(sa.teacherId);
        }
        for (const [subjectId, teacherIds] of expected) {
            const currentST = await db_1.default.subjectTeacher.findMany({
                where: { schoolId, subjectId },
            });
            const currentIds = new Set(currentST.map((s) => s.teacherId));
            for (const teacherId of teacherIds) {
                if (!currentIds.has(teacherId)) {
                    await db_1.default.subjectTeacher.create({
                        data: { schoolId, subjectId, teacherId },
                    });
                    report.subjectTeacherLinksCreated++;
                }
            }
            for (const st of currentST) {
                if (!teacherIds.has(st.teacherId)) {
                    await db_1.default.subjectTeacher.delete({ where: { id: st.id } });
                    report.subjectTeacherLinksPruned++;
                }
            }
        }
        // Subjects with no SubjectArm rows at all: drop stale SubjectTeacher rows
        // 4. Sync StudentSubject per student to arm-offered subjects
        const students = await db_1.default.student.findMany({
            where: { schoolId },
            select: { id: true, armId: true },
        });
        const armSubjectsMap = new Map();
        for (const sa of armsAfter) {
            if (!armSubjectsMap.has(sa.armId))
                armSubjectsMap.set(sa.armId, new Set());
            armSubjectsMap.get(sa.armId).add(sa.subjectId);
        }
        for (const student of students) {
            const offered = armSubjectsMap.get(student.armId || "") || new Set();
            const current = await db_1.default.studentSubject.findMany({
                where: { schoolId, studentId: student.id },
            });
            const currentIds = new Set(current.map((c) => c.subjectId));
            for (const subjectId of offered) {
                if (!currentIds.has(subjectId)) {
                    await db_1.default.studentSubject.create({
                        data: { schoolId, studentId: student.id, subjectId },
                    });
                    report.studentSubjectLinksAdded++;
                }
            }
            for (const ss of current) {
                if (!offered.has(ss.subjectId)) {
                    await db_1.default.studentSubject.delete({ where: { id: ss.id } });
                    report.studentSubjectLinksRemoved++;
                }
            }
        }
        // 5. Remove StudentSubject rows for students who no longer exist / left
        const studentIds = new Set(students.map((s) => s.id));
        const allSS = await db_1.default.studentSubject.findMany({ where: { schoolId } });
        for (const ss of allSS) {
            if (!studentIds.has(ss.studentId)) {
                await db_1.default.studentSubject.delete({ where: { id: ss.id } });
                report.orphanStudentSubjectsRemoved++;
            }
        }
        return report;
    },
};
exports.default = exports.syncService;
