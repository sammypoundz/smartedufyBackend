"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherRegistrationService = void 0;
// backend/src/services/teacherRegistrationService.ts
// Teacher self-registration approval workflow.
//
// When a teacher self-registers they get a Teacher record with
// registrationStatus = 'PENDING' (and their User record starts inactive so
// they can't log into the workspace before an admin approves them). The admin
// dashboard lists pending teachers; approving one:
//   - marks the teacher APPROVED and activates the user account,
//   - auto-assigns them according to their declared profile:
//       * FORM_TEACHER / BOTH  -> Arm.teacherId set for the class(es) they chose
//         (first arm of that class), and SubjectTeacher rows for the subjects
//         they declared (taught in the classes they head).
//       * SUBJECT_TEACHER / BOTH -> SubjectArm.teacherId set for every arm of
//         the chosen classes that already offers that subject, plus
//         SubjectTeacher join rows.
//       * If they listed subjects but the school hasn't created them yet,
//         missing subjects are auto-created so the assignment always lands.
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.teacherRegistrationService = {
    /** All teachers whose self-registration is pending admin review. */
    listPending: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        return db_1.default.teacher.findMany({
            where: { schoolId: tenantId, registrationStatus: "PENDING" },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                teacherType: true,
                briefSubjects: true,
                registrationStatus: true,
                createdAt: true,
                user: { select: { id: true, email: true, isActive: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    },
    /** Count of pending registrations — powers the sidebar badge. */
    countPending: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        return db_1.default.teacher.count({
            where: { schoolId: tenantId, registrationStatus: "PENDING" },
        });
    },
    /**
     * Approve a pending teacher registration and auto-assign them per the
     * preferences they declared during profile setup.
     */
    approve: async (teacherId, opts) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const teacher = await db_1.default.teacher.findUnique({
            where: { id: teacherId },
        });
        if (!teacher || teacher.schoolId !== tenantId) {
            throw new Error("Teacher not found");
        }
        const brief = (teacher.briefSubjects || {});
        const wantedClasses = brief.classes || [];
        const wantedSubjects = brief.subjects || [];
        const wantsForm = teacher.teacherType === "FORM_TEACHER" || teacher.teacherType === "BOTH";
        const wantsSubject = teacher.teacherType === "SUBJECT_TEACHER" ||
            teacher.teacherType === "BOTH";
        const result = await db_1.default.$transaction(async (tx) => {
            const assignedArms = [];
            const assignedSubjects = [];
            const tenantClassIds = (await tx.class.findMany({ where: { schoolId: tenantId }, select: { id: true } })).map((c) => c.id);
            // ---- Resolve classes (by name) ----
            const classes = wantedClasses.length
                ? await tx.class.findMany({
                    where: { schoolId: tenantId, name: { in: wantedClasses } },
                    include: { arms: true },
                })
                : [];
            // ---- Resolve / create subjects (by name) ----
            const subjectIds = [];
            for (const name of wantedSubjects) {
                let subject = await tx.subject.findFirst({
                    where: { schoolId: tenantId, name },
                });
                if (!subject) {
                    // Subject doesn't exist yet — create it so the assignment lands.
                    subject = await tx.subject.create({
                        data: { schoolId: tenantId, name },
                    });
                }
                subjectIds.push({ id: subject.id, name: subject.name });
            }
            // ---- FORM TEACHER: head the arms they picked (fall back to the first
            //      arm of each chosen class for legacy briefs) ----
            if (wantsForm) {
                if (brief.armIds?.length) {
                    const chosenArms = await tx.arm.findMany({
                        where: { id: { in: brief.armIds }, classId: { in: tenantClassIds } },
                        include: { class: true },
                    });
                    for (const arm of chosenArms) {
                        await tx.arm.update({
                            where: { id: arm.id },
                            data: { teacherId: teacher.id },
                        });
                        assignedArms.push(`${arm.class.name} – Arm ${arm.letter}`);
                    }
                }
                else {
                    for (const cls of classes) {
                        const arm = cls.arms[0];
                        if (!arm)
                            continue;
                        await tx.arm.update({
                            where: { id: arm.id },
                            data: { teacherId: teacher.id },
                        });
                        assignedArms.push(`${cls.name} (${arm.letter})`);
                    }
                }
            }
            // ---- SUBJECT TEACHER: attach to subject/arms + SubjectTeacher rows ----
            if (wantsSubject) {
                for (const subject of subjectIds) {
                    // SubjectTeacher join (teacher teaches this subject)
                    await tx.subjectTeacher.upsert({
                        where: {
                            schoolId_subjectId_teacherId: {
                                schoolId: tenantId,
                                subjectId: subject.id,
                                teacherId: teacher.id,
                            },
                        },
                        create: {
                            schoolId: tenantId,
                            subjectId: subject.id,
                            teacherId: teacher.id,
                        },
                        update: {},
                    });
                    // Attach the teacher to the subject in exactly the arms they chose
                    // (subjectArms). Legacy briefs fall back to all arms of the classes
                    // they chose.
                    const pairs = brief.subjectArms?.filter((sa) => sa.subject === subject.name) ?? [];
                    const armTargets = pairs.length
                        ? (await tx.arm.findMany({
                            where: {
                                id: { in: pairs.map((p) => p.armId) },
                                classId: { in: tenantClassIds },
                            },
                            include: { class: true },
                        })).map((arm) => ({
                            id: arm.id,
                            label: `${arm.class.name} – Arm ${arm.letter}`,
                        }))
                        : classes.flatMap((cls) => cls.arms.map((arm) => ({
                            id: arm.id,
                            label: `${cls.name} – Arm ${arm.letter}`,
                        })));
                    for (const target of armTargets) {
                        const subjectArm = await tx.subjectArm.findUnique({
                            where: {
                                schoolId_subjectId_armId: {
                                    schoolId: tenantId,
                                    subjectId: subject.id,
                                    armId: target.id,
                                },
                            },
                        });
                        if (subjectArm) {
                            await tx.subjectArm.update({
                                where: { id: subjectArm.id },
                                data: { teacherId: teacher.id },
                            });
                        }
                        else {
                            await tx.subjectArm.create({
                                data: {
                                    schoolId: tenantId,
                                    subjectId: subject.id,
                                    armId: target.id,
                                    teacherId: teacher.id,
                                },
                            });
                        }
                    }
                    if (armTargets.length > 0) {
                        const byClass = new Map();
                        for (const t of armTargets) {
                            const [clsName] = t.label.split(" – Arm ");
                            byClass.set(clsName, [...(byClass.get(clsName) || []), t.label]);
                        }
                        for (const labels of byClass.values()) {
                            assignedSubjects.push(`${subject.name} → ${labels.join(", ")}`);
                        }
                    }
                }
            }
            // ---- Mark approved + activate the user account ----
            await tx.teacher.update({
                where: { id: teacher.id },
                data: {
                    registrationStatus: "APPROVED",
                    isActive: opts?.makeActive ?? true,
                },
            });
            await tx.user.update({
                where: { id: teacher.userId },
                data: { isActive: true },
            });
            return { assignedArms, assignedSubjects };
        });
        return { teacherId: teacher.id, ...result };
    },
    /** Reject a pending registration — the teacher record/user stays but is deactivated. */
    reject: async (teacherId, note) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const teacher = await db_1.default.teacher.findUnique({
            where: { id: teacherId },
        });
        if (!teacher || teacher.schoolId !== tenantId) {
            throw new Error("Teacher not found");
        }
        await db_1.default.teacher.update({
            where: { id: teacherId },
            data: { registrationStatus: "REJECTED", isActive: false },
        });
        await db_1.default.user.update({
            where: { id: teacher.userId },
            data: { isActive: false },
        });
        return { teacherId, note };
    },
};
