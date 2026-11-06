// School SELF-ONBOARDING wizard API (mounted at /api/onboarding).
// The school's own ADMIN walks through the 8 guided stages — progress is
// stored per-school so the wizard can be resumed at any time.
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest, roleGuard } from "../middleware/auth";
import {
  ONBOARDING_STAGES,
  completeStage,
  reopenStage,
  saveDraft,
  resetProgress,
  getOrCreateProgress,
  getOnboardingSnapshot,
  setupAcademicYear,
  bulkCreateClasses,
  bulkCreateSubjects,
  StageOrderError,
  OnboardingStage,
} from "../services/schoolOnboardingService";

const router = Router();
router.use(authMiddleware, roleGuard(["ADMIN", "PRINCIPAL"]));

const stageSchema = z.enum(
  ONBOARDING_STAGES as unknown as [string, ...string[]],
);

const asyncRoute =
  (fn: (req: AuthRequest, res: Response) => Promise<any>) =>
  (req: AuthRequest, res: Response) => {
    fn(req, res).catch((e: any) => {
      const status = e instanceof StageOrderError ? 409 : e.status || 500;
      console.error("onboarding route error:", e.message);
      res.status(status).json({ error: e.message || "Internal server error" });
    });
  };

// GET /api/onboarding/progress — wizard state for the current school.
// `required` mirrors School.onboardingRequired (set by the Super Admin) so
// the admin panel can gate the whole UI behind the wizard until it's done.
router.get(
  "/progress",
  asyncRoute(async (req, res) => {
    const schoolId = req.user!.schoolId;
    const progress = await getOrCreateProgress(schoolId);
    const snapshot = await getOnboardingSnapshot(schoolId);
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { onboardingRequired: true },
    });
    res.json({
      progress,
      snapshot,
      stages: ONBOARDING_STAGES,
      required: !!school?.onboardingRequired,
      completed: ONBOARDING_STAGES.every((s) =>
        progress.completedStages.includes(s),
      ),
    });
  }),
);

// POST /api/onboarding/progress/:stage/complete — mark a stage done (with data)
router.post(
  "/progress/:stage/complete",
  asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage) as OnboardingStage;
    const updated = await completeStage(req.user!.schoolId, stage, req.body);
    res.json(updated);
  }),
);

// POST /api/onboarding/progress/:stage/draft — save answers without completing
router.post(
  "/progress/:stage/draft",
  asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage) as OnboardingStage;
    const updated = await saveDraft(req.user!.schoolId, stage, req.body || {});
    res.json(updated);
  }),
);

// POST /api/onboarding/progress/:stage/reopen — jump back to a completed stage
router.post(
  "/progress/:stage/reopen",
  asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage) as OnboardingStage;
    const updated = await reopenStage(req.user!.schoolId, stage);
    res.json(updated);
  }),
);

// POST /api/onboarding/progress/reset — start the wizard over
router.post(
  "/progress/reset",
  asyncRoute(async (req, res) => {
    const updated = await resetProgress(req.user!.schoolId);
    res.json(updated);
  }),
);

// POST /api/onboarding/academic — create/activate an academic year + terms
router.post(
  "/academic",
  asyncRoute(async (req, res) => {
    const schema = z.object({
      yearName: z.string().min(4).max(30),
      termNames: z.array(z.string().min(1)).min(1).max(4),
      activeTermId: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const year = await setupAcademicYear(req.user!.schoolId, data);
    res.status(201).json(year);
  }),
);

// POST /api/onboarding/classes — bulk create classes (each with "Arm A")
router.post(
  "/classes",
  asyncRoute(async (req, res) => {
    const schema = z.object({ names: z.array(z.string().min(1)).min(1) });
    const { names } = schema.parse(req.body);
    const result = await bulkCreateClasses(req.user!.schoolId, names, {
      id: req.user!.id,
      name: req.user!.name || "Admin",
    });
    res.status(201).json(result);
  }),
);

// POST /api/onboarding/subjects — bulk create subjects
router.post(
  "/subjects",
  asyncRoute(async (req, res) => {
    const schema = z.object({ names: z.array(z.string().min(1)).min(1) });
    const { names } = schema.parse(req.body);
    const result = await bulkCreateSubjects(req.user!.schoolId, names);
    res.status(201).json(result);
  }),
);

export default router;
