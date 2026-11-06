// School SELF-ONBOARDING progress service.
// The school's own ADMIN walks through the 8 guided stages inside the admin
// panel — the Super Admin no longer sets this up for them. One row per school
// (SchoolOnboardingProgress, created lazily) remembers which stages are done
// and any free-form stageData so the wizard can be resumed mid-way.
import { prisma } from "../config/prisma";
import { runWithTenant } from "../utils/tenantContext";

export const ONBOARDING_STAGES = [
  "PROFILE",
  "ACADEMIC",
  "CLASSES",
  "SUBJECTS",
  "STAFF",
  "STUDENTS",
  "FEES",
  "FINISH",
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export class StageOrderError extends Error {
  constructor(
    public from: OnboardingStage,
    public to: OnboardingStage,
  ) {
    super(
      `Cannot jump from "${from}" to "${to}" — complete the stages in order`,
    );
    this.name = "StageOrderError";
  }
}

/** Stage keys completed out of the canonical order. */
export function isStageUnlocked(
  currentStage: OnboardingStage,
  target: OnboardingStage,
): boolean {
  return (
    ONBOARDING_STAGES.indexOf(target) <=
    ONBOARDING_STAGES.indexOf(currentStage) + 1
  );
}

/** Lazily create + return the school's progress row. */
export async function getOrCreateProgress(schoolId: string) {
  let progress = await prisma.schoolOnboardingProgress.findUnique({
    where: { schoolId },
  });
  if (!progress) {
    progress = await prisma.schoolOnboardingProgress.create({
      data: { schoolId },
    });
  }
  return progress;
}

/** Mark a stage complete and advance currentStage to the next incomplete one. */
export async function completeStage(
  schoolId: string,
  stage: OnboardingStage,
  stageData?: Record<string, unknown>,
) {
  const progress = await getOrCreateProgress(schoolId);
  if (!isStageUnlocked(progress.currentStage as OnboardingStage, stage)) {
    throw new StageOrderError(progress.currentStage as OnboardingStage, stage);
  }
  // PROFILE: persist the school name the admin typed so report cards,
  // receipts and the parent portal show it immediately.
  if (
    stage === "PROFILE" &&
    stageData &&
    typeof (stageData as any).name === "string" &&
    (stageData as any).name.trim()
  ) {
    await prisma.school.update({
      where: { id: schoolId },
      data: { name: (stageData as any).name.trim() },
    });
  }
  const completedStages = [...new Set([...progress.completedStages, stage])];
  // Next stage = first stage after this one not yet completed, so re-doing
  // an early stage never rewinds the wizard past already-finished ones.
  const nextStage =
    ONBOARDING_STAGES.find(
      (s, i) => i > ONBOARDING_STAGES.indexOf(stage) && !completedStages.includes(s),
    ) || "FINISH";
  const allDone = ONBOARDING_STAGES.every((s) => completedStages.includes(s));
  return prisma.schoolOnboardingProgress.update({
    where: { schoolId },
    data: {
      completedStages,
      currentStage: nextStage,
      stageData:
        stageData !== undefined
          ? { ...(progress.stageData as object | null), [stage]: stageData }
          : (progress.stageData as object | null),
      completedAt:
        allDone && !progress.completedAt ? new Date() : progress.completedAt,
    },
  });
}

/** Rewind the wizard to a specific already-completed stage (editing). */
export async function reopenStage(schoolId: string, stage: OnboardingStage) {
  const progress = await getOrCreateProgress(schoolId);
  if (!progress.completedStages.includes(stage)) {
    throw new Error(`Stage "${stage}" has not been completed yet`);
  }
  return prisma.schoolOnboardingProgress.update({
    where: { schoolId },
    data: { currentStage: stage, completedAt: null },
  });
}

/** Save draft answers without marking the stage complete (resumable). */
export async function saveDraft(
  schoolId: string,
  stage: OnboardingStage,
  stageData: Record<string, unknown>,
) {
  const progress = await getOrCreateProgress(schoolId);
  return prisma.schoolOnboardingProgress.update({
    where: { schoolId },
    data: {
      stageData: {
        ...((progress.stageData as object | null) || {}),
        [stage]: stageData,
      } as any,
    },
  });
}

/** Reset everything — admin wants to start over. */
export async function resetProgress(schoolId: string) {
  await getOrCreateProgress(schoolId);
  return prisma.schoolOnboardingProgress.update({
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
export async function getOnboardingSnapshot(schoolId: string) {
  const [school, classes, subjects, teachers, students, feeStructures, year] =
    await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, logoUrl: true },
      }),
      prisma.class.findMany({ where: { schoolId } }),
      prisma.subject.findMany({ where: { schoolId } }),
      prisma.teacher.findMany({ where: { schoolId } }),
      prisma.student.findMany({ where: { schoolId } }),
      prisma.feeStructure.findMany({ where: { schoolId } }),
      prisma.academicYear.findFirst({
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
export async function setupAcademicYear(
  schoolId: string,
  data: { yearName: string; termNames: string[]; activeTermId?: string },
) {
  return runWithTenant(schoolId, async () => {
    let year = await prisma.academicYear.findUnique({
      where: { schoolId_name: { schoolId, name: data.yearName } },
      include: { terms: true },
    });
    if (!year) {
      year = await prisma.academicYear.create({
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
    await prisma.academicYear.updateMany({
      where: { schoolId },
      data: { isActive: false },
    });
    await prisma.academicYear.update({
      where: { id: year.id },
      data: { isActive: true },
    });
    const activeTerm =
      year.terms.find((t) => t.id === data.activeTermId) || year.terms[0];
    if (activeTerm) {
      await prisma.globalSetting.upsert({
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
export async function bulkCreateClasses(
  schoolId: string,
  names: string[],
  admin: { id: string; name: string },
) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const existing = await prisma.class.findMany({
    where: { schoolId },
    select: { name: true },
  });
  const existingKeys = new Set(
    existing.map((c) => c.name.toLowerCase().trim()),
  );
  const created: string[] = [];
  for (const name of clean) {
    if (existingKeys.has(name.toLowerCase())) continue;
    const cls = await prisma.class.create({ data: { schoolId, name } });
    await prisma.arm.create({
      data: { schoolId, letter: "A", classId: cls.id },
    });
    created.push(name);
  }
  return { created, skipped: clean.length - created.length };
}

/**
 * Bulk-create subjects in one go for the wizard. Skips names that already
 * exist (case-insensitive).
 */
export async function bulkCreateSubjects(schoolId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const existing = await prisma.subject.findMany({
    where: { schoolId },
    select: { name: true },
  });
  const existingKeys = new Set(
    existing.map((s) => s.name.toLowerCase().trim()),
  );
  const created: string[] = [];
  for (const name of clean) {
    if (existingKeys.has(name.toLowerCase())) continue;
    await prisma.subject.create({ data: { schoolId, name } });
    created.push(name);
  }
  return { created, skipped: clean.length - created.length };
}
