"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.offlineService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
/**
 * offlineService — builds the authorized offline data bundle for the
 * authenticated teacher and replays queued offline operations.
 *
 * The bundle contains ONLY records the teacher is entitled to see:
 *  - Arms the teacher owns (form teacher) or teaches a subject in.
 *  - Students belonging to those arms.
 *  - Subjects offered in those arms.
 *  - Timetable entries for those arms.
 * All queries are tenant-scoped via the tenant middleware context.
 */
exports.offlineService = {
    /**
     * Build the offline bundle for a teacher user.
     * @param userId - Authenticated user id (from JWT)
     * @param role - Authenticated primary role
     */
    buildTeacherBundle: async (userId, role) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const roles = [role].filter(Boolean).map((r) => r.toUpperCase());
        const isAdmin = roles.includes("ADMIN") || roles.includes("PRINCIPAL");
        // Resolve the teacher record for this user (teachers only).
        let teacher = null;
        if (!isAdmin) {
            teacher = await db_1.default.teacher.findUnique({ where: { userId } });
            if (!teacher)
                throw new Error("Teacher profile not found");
        }
        // Arms the teacher is authorised for.
        const armWhere = { schoolId: tenantId };
        if (teacher) {
            armWhere.OR = [
                { teacherId: teacher.id }, // form teacher
                { subjects: { some: { teacherId: teacher.id } } }, // subject teacher
            ];
        }
        const arms = await db_1.default.arm.findMany({
            where: armWhere,
            include: {
                class: { select: { id: true, name: true } },
                subjects: {
                    include: { subject: { select: { id: true, name: true } } },
                },
            },
        });
        const armIds = arms.map((a) => a.id);
        const [students, timetableEntries, lessonPlans] = await Promise.all([
            db_1.default.student.findMany({
                where: { schoolId: tenantId, armId: { in: armIds }, isActive: true },
                select: {
                    id: true,
                    name: true,
                    gender: true,
                    admissionNumber: true,
                    classId: true,
                    armId: true,
                },
                orderBy: { name: "asc" },
            }),
            db_1.default.timetableEntry.findMany({
                where: { schoolId: tenantId, armId: { in: armIds } },
                select: {
                    id: true,
                    armId: true,
                    dayOfWeek: true,
                    timeSlot: true,
                    subjectId: true,
                    subject: { select: { id: true, name: true } },
                },
            }),
            db_1.default.lessonPlan.findMany({
                where: { schoolId: tenantId, armId: { in: armIds } },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    classId: true,
                    armId: true,
                    subjectId: true,
                    status: true,
                    fileName: true,
                    fileType: true,
                    updatedAt: true,
                },
                orderBy: { updatedAt: "desc" },
            }),
        ]);
        // Subjects referenced across the authorised arms.
        const subjectMap = new Map();
        for (const arm of arms) {
            for (const sa of arm.subjects) {
                subjectMap.set(sa.subject.id, {
                    id: sa.subject.id,
                    name: sa.subject.name,
                });
            }
        }
        return {
            generatedAt: new Date().toISOString(),
            teacher: teacher ? { id: teacher.id, name: teacher.name, userId } : null,
            arms: arms.map((a) => ({
                id: a.id,
                letter: a.letter,
                alias: a.alias,
                classId: a.class.id,
                className: a.class.name,
                isFormTeacher: teacher ? a.teacherId === teacher.id : true,
                subjects: a.subjects.map((sa) => ({
                    id: sa.subject.id,
                    name: sa.subject.name,
                })),
            })),
            students,
            subjects: Array.from(subjectMap.values()),
            timetable: timetableEntries,
            lessonPlans,
        };
    },
    /**
     * Replay one queued offline operation. Every operation is idempotent —
     * the client sends opId and we return its outcome; repeating the same
     * attendance/score upserts is safe because they are keyed by natural
     * unique constraints (studentId+date, studentId+subjectId+armId+term).
     */
    applyOperation: async (op) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        switch (op.type) {
            case "ATTENDANCE_SAVE": {
                const { armId, date, records } = op.payload;
                if (!armId || !date || !Array.isArray(records)) {
                    throw new Error("Invalid attendance payload");
                }
                const { attendanceService } = await Promise.resolve().then(() => __importStar(require("./attendanceService")));
                await attendanceService.saveBulkForArm(armId, new Date(date), records);
                return { ok: true };
            }
            case "RESULTS_SAVE": {
                const { results } = op.payload;
                if (!Array.isArray(results))
                    throw new Error("Invalid results payload");
                const { resultService } = await Promise.resolve().then(() => __importStar(require("./resultService")));
                await resultService.bulkUpsert(results);
                return { ok: true };
            }
            case "LESSON_PLAN_CREATE": {
                const p = op.payload;
                // Text-only lesson note (no file). fileUrl is a placeholder — the
                // offline flow only supports notes without attachments for now.
                const created = await db_1.default.lessonPlan.create({
                    data: {
                        schoolId: tenantId,
                        title: String(p.title || "Untitled lesson note"),
                        description: p.description ?? null,
                        classId: p.classId,
                        armId: p.armId,
                        subjectId: p.subjectId,
                        status: "DRAFT",
                        fileUrl: `offline/${op.opId}`,
                        fileName: p.fileName || "offline-note.txt",
                        fileType: p.fileType || "text/plain",
                    },
                });
                return { ok: true, id: created.id };
            }
            case "LESSON_PLAN_UPDATE": {
                const p = op.payload;
                const existing = await db_1.default.lessonPlan.findFirst({
                    where: { id: p.id, schoolId: tenantId },
                });
                if (!existing)
                    throw new Error("Lesson plan not found");
                await db_1.default.lessonPlan.update({
                    where: { id: p.id },
                    data: {
                        title: p.title ?? existing.title,
                        description: p.description ?? existing.description,
                        status: p.status ?? existing.status,
                    },
                });
                return { ok: true };
            }
            default:
                throw new Error(`Unknown operation type: ${op.type}`);
        }
    },
};
