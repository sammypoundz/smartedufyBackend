"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageOrderError = exports.ONBOARDING_STAGES = void 0;
exports.isStageUnlocked = isStageUnlocked;
exports.getOrCreateProgress = getOrCreateProgress;
exports.completeStage = completeStage;
exports.reopenStage = reopenStage;
exports.saveDraft = saveDraft;
exports.resetProgress = resetProgress;
exports.getOnboardingSnapshot = getOnboardingSnapshot;
exports.setupAcademicYear = setupAcademicYear;
exports.bulkCreateClasses = bulkCreateClasses;
exports.bulkCreateSubjects = bulkCreateSubjects;
// School SELF-ONBOARDING progress service.
// The school's own ADMIN walks through the 8 guided stages inside the admin
// panel — the Super Admin no longer sets this up for them. One row per school
// (SchoolOnboardingProgress, created lazily) remembers which stages are done
// and any free-form stageData so the wizard can be resumed mid-way.
const prisma_1 = require("../config/prisma");
const tenantContext_1 = require("../utils/tenantContext");
exports.ONBOARDING_STAGES = [
    "PROFILE",
    "ACADEMIC",
    "CLASSES",
    "SUBJECTS",
    "STAFF",
    "STUDENTS",
    "FEES",
    "FINISH",
];
class StageOrderError extends Error {
    constructor(from, to) {
        super(`Cannot jump from "${from}" to "${to}" — complete the stages in order`);
        this.from = from;
        this.to = to;
        this.name = "StageOrderError";
    }
}
exports.StageOrderError = StageOrderError;
/** Stage keys completed out of the canonical order. */
function isStageUnlocked(currentStage, target) {
    return (exports.ONBOARDING_STAGES.indexOf(target) <=
        exports.ONBOARDING_STAGES.indexOf(currentStage) + 1);
}
/** Lazily create + return the school's progress row. */
async function getOrCreateProgress(schoolId) {
    let progress = await prisma_1.prisma.schoolOnboardingProgress.findUnique({
        where: { schoolId },
    });
    if (!progress) {
        progress = await prisma_1.prisma.schoolOnboardingProgress.create({
            data: { schoolId },
        });
    }
    return progress;
}
/** Mark a stage complete and advance currentStage to the next incomplete one. */
async function completeStage(schoolId, stage, stageData) {
    const progress = await getOrCreateProgress(schoolId);
    // Stages can be completed in ANY order — the wizard tabs are freely
    // navigable, and each stage validates its own data before submitting.
    // PROFILE: persist the school name the admin typed so report cards,
    // receipts and the parent portal show it immediately.
    if (stage === "PROFILE" &&
        stageData &&
        typeof stageData.name === "string" &&
        stageData.name.trim()) {
        await prisma_1.prisma.school.update({
            where: { id: schoolId },
            data: { name: stageData.name.trim() },
        });
    }
    const completedStages = [...new Set([...progress.completedStages, stage])];
    // Next stage = first stage after this one not yet completed, so re-doing
    // an early stage never rewinds the wizard past already-finished ones.
    const nextStage = exports.ONBOARDING_STAGES.find((s, i) => i > exports.ONBOARDING_STAGES.indexOf(stage) && !completedStages.includes(s)) || "FINISH";
    const allDone = exports.ONBOARDING_STAGES.every((s) => completedStages.includes(s));
    return prisma_1.prisma.schoolOnboardingProgress.update({
        where: { schoolId },
        data: {
            completedStages,
            currentStage: nextStage,
            stageData: stageData !== undefined
                ? { ...progress.stageData, [stage]: stageData }
                : progress.stageData,
            completedAt: allDone && !progress.completedAt ? new Date() : progress.completedAt,
        },
    });
}
/** Rewind the wizard to a specific already-completed stage (editing). */
async function reopenStage(schoolId, stage) {
    const progress = await getOrCreateProgress(schoolId);
    if (!progress.completedStages.includes(stage)) {
        throw new Error(`Stage "${stage}" has not been completed yet`);
    }
    return prisma_1.prisma.schoolOnboardingProgress.update({
        where: { schoolId },
        data: { currentStage: stage, completedAt: null },
    });
}
/** Save draft answers without marking the stage complete (resumable). */
async function saveDraft(schoolId, stage, stageData) {
    const progress = await getOrCreateProgress(schoolId);
    return prisma_1.prisma.schoolOnboardingProgress.update({
        where: { schoolId },
        data: {
            stageData: {
                ...(progress.stageData || {}),
                [stage]: stageData,
            },
        },
    });
}
/** Reset everything — admin wants to start over. */
async function resetProgress(schoolId) {
    await getOrCreateProgress(schoolId);
    return prisma_1.prisma.schoolOnboardingProgress.update({
        where: { schoolId },
        data: {
            completedStages: [],
            stageData: undefined,
            currentStage: "PROFILE",
            completedAt: null,
        },
    });
}
/**
 * Live "what already exists in this school" snapshot so the wizard shows
 * pre-filled / partially-done indicators on each stage.
 */
async function getOnboardingSnapshot(schoolId) {
    const [school, classes, subjects, teachers, students, feeStructures, year] = await Promise.all([
        prisma_1.prisma.school.findUnique({
            where: { id: schoolId },
            select: { id: true, name: true, logoUrl: true },
        }),
        prisma_1.prisma.class.findMany({ where: { schoolId } }),
        prisma_1.prisma.subject.findMany({ where: { schoolId } }),
        prisma_1.prisma.teacher.findMany({ where: { schoolId } }),
        prisma_1.prisma.student.findMany({ where: { schoolId } }),
        prisma_1.prisma.feeStructure.findMany({ where: { schoolId } }),
        prisma_1.prisma.academicYear.findFirst({
            where: { schoolId, isActive: true },
            include: { terms: true },
        }),
    ]);
    return {
        school,
        counts: {
            classes: classes.length,
            subjects: subjects.length,
            teachers: teachers.length,
            students: students.length,
            feeStructures: feeStructures.length,
            terms: year?.terms.length || 0,
            activeYear: year ? { id: year.id, name: year.name } : null,
        },
        classList: classes.map((c) => ({ id: c.id, name: c.name })),
        subjectList: subjects.map((s) => ({ id: s.id, name: s.name })),
    };
}
/**
 * One-shot bulk setup used by the wizard's "Academic" stage: creates the
 * academic year with its three terms and activates First Term. Runs inside
 * the school's tenant context so the ID generator (if touched) works.
 */
async function setupAcademicYear(schoolId, data) {
    return (0, tenantContext_1.runWithTenant)(schoolId, async () => {
        let year = await prisma_1.prisma.academicYear.findUnique({
            where: { schoolId_name: { schoolId, name: data.yearName } },
            include: { terms: true },
        });
        if (!year) {
            year = await prisma_1.prisma.academicYear.create({
                data: {
                    name: data.yearName,
                    schoolId,
                    terms: {
                        create: data.termNames.map((name, idx) => ({
                            name,
                            order: idx + 1,
                            schoolId,
                        })),
                    },
                },
                include: { terms: true },
            });
        }
        // Activate the year + chosen term (default First Term).
        await prisma_1.prisma.academicYear.updateMany({
            where: { schoolId },
            data: { isActive: false },
        });
        await prisma_1.prisma.academicYear.update({
            where: { id: year.id },
            data: { isActive: true },
        });
        const activeTerm = year.terms.find((t) => t.id === data.activeTermId) || year.terms[0];
        if (activeTerm) {
            await prisma_1.prisma.globalSetting.upsert({
                where: { key: "activeTermId" },
                update: { value: activeTerm.id },
                create: { key: "activeTermId", value: activeTerm.id },
            });
        }
        return year;
    });
}
/**
 * Bulk-create classes (each with an "Arm A") in one go for the wizard.
 * Skips names that already exist (fuzzy match on trimmed lowercase).
 */
async function bulkCreateClasses(schoolId, names, admin) {
    // The tenant Prisma middleware injects/matches schoolId against the
    // AsyncLocalStorage tenant context — run inside the school's context so
    // class + arm creates don't fail with "Cannot create record for a
    // different tenant" (the wizard routes set no tenant header).
    return (0, tenantContext_1.runWithTenant)(schoolId, async () => {
        const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
        const existing = await prisma_1.prisma.class.findMany({
            where: { schoolId },
            select: { name: true },
        });
        const existingKeys = new Set(existing.map((c) => c.name.toLowerCase().trim()));
        const created = [];
        for (const name of clean) {
            if (existingKeys.has(name.toLowerCase()))
                continue;
            const cls = await prisma_1.prisma.class.create({ data: { schoolId, name } });
            await prisma_1.prisma.arm.create({
                data: { schoolId, letter: "A", classId: cls.id },
            });
            created.push(name);
        }
        return { created, skipped: clean.length - created.length };
    });
}
/**
 * Bulk-create subjects in one go for the wizard. Skips names that already
 * exist (case-insensitive).
 */
async function bulkCreateSubjects(schoolId, names) {
    // Same tenant-context requirement as bulkCreateClasses above.
    return (0, tenantContext_1.runWithTenant)(schoolId, async () => {
        const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
        const existing = await prisma_1.prisma.subject.findMany({
            where: { schoolId },
            select: { name: true },
        });
        const existingKeys = new Set(existing.map((s) => s.name.toLowerCase().trim()));
        const created = [];
        for (const name of clean) {
            if (existingKeys.has(name.toLowerCase()))
                continue;
            await prisma_1.prisma.subject.create({ data: { schoolId, name } });
            created.push(name);
        }
        return { created, skipped: clean.length - created.length };
    });
}
