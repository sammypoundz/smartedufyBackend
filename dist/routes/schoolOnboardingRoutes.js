"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// School SELF-ONBOARDING wizard API (mounted at /api/onboarding).
// The school's own ADMIN walks through the 8 guided stages — progress is
// stored per-school so the wizard can be resumed at any time.
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const schoolOnboardingService_1 = require("../services/schoolOnboardingService");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]));
const stageSchema = zod_1.z.enum(schoolOnboardingService_1.ONBOARDING_STAGES);
const asyncRoute = (fn) => (req, res) => {
    fn(req, res).catch((e) => {
        const status = e instanceof schoolOnboardingService_1.StageOrderError ? 409 : e.status || 500;
        console.error("onboarding route error:", e.message);
        res.status(status).json({ error: e.message || "Internal server error" });
    });
};
// GET /api/onboarding/progress — wizard state for the current school.
// `required` mirrors School.onboardingRequired (set by the Super Admin) so
// the admin panel can gate the whole UI behind the wizard until it's done.
router.get("/progress", asyncRoute(async (req, res) => {
    const schoolId = req.user.schoolId;
    const progress = await (0, schoolOnboardingService_1.getOrCreateProgress)(schoolId);
    const snapshot = await (0, schoolOnboardingService_1.getOnboardingSnapshot)(schoolId);
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: schoolId },
        select: { onboardingRequired: true },
    });
    res.json({
        progress,
        snapshot,
        stages: schoolOnboardingService_1.ONBOARDING_STAGES,
        required: !!school?.onboardingRequired,
        completed: schoolOnboardingService_1.ONBOARDING_STAGES.every((s) => progress.completedStages.includes(s)),
    });
}));
// POST /api/onboarding/progress/:stage/complete — mark a stage done (with data)
router.post("/progress/:stage/complete", asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage);
    const updated = await (0, schoolOnboardingService_1.completeStage)(req.user.schoolId, stage, req.body);
    res.json(updated);
}));
// POST /api/onboarding/progress/:stage/draft — save answers without completing
router.post("/progress/:stage/draft", asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage);
    const updated = await (0, schoolOnboardingService_1.saveDraft)(req.user.schoolId, stage, req.body || {});
    res.json(updated);
}));
// POST /api/onboarding/progress/:stage/reopen — jump back to a completed stage
router.post("/progress/:stage/reopen", asyncRoute(async (req, res) => {
    const stage = stageSchema.parse(req.params.stage);
    const updated = await (0, schoolOnboardingService_1.reopenStage)(req.user.schoolId, stage);
    res.json(updated);
}));
// POST /api/onboarding/progress/reset — start the wizard over
router.post("/progress/reset", asyncRoute(async (req, res) => {
    const updated = await (0, schoolOnboardingService_1.resetProgress)(req.user.schoolId);
    res.json(updated);
}));
// POST /api/onboarding/academic — create/activate an academic year + terms
router.post("/academic", asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        yearName: zod_1.z.string().min(4).max(30),
        termNames: zod_1.z.array(zod_1.z.string().min(1)).min(1).max(4),
        activeTermId: zod_1.z.string().optional(),
    });
    const data = schema.parse(req.body);
    const year = await (0, schoolOnboardingService_1.setupAcademicYear)(req.user.schoolId, data);
    res.status(201).json(year);
}));
// POST /api/onboarding/classes — bulk create classes (each with "Arm A")
router.post("/classes", asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({ names: zod_1.z.array(zod_1.z.string().min(1)).min(1) });
    const { names } = schema.parse(req.body);
    const result = await (0, schoolOnboardingService_1.bulkCreateClasses)(req.user.schoolId, names, {
        id: req.user.id,
        name: req.user.name || "Admin",
    });
    res.status(201).json(result);
}));
// POST /api/onboarding/subjects — bulk create subjects
router.post("/subjects", asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({ names: zod_1.z.array(zod_1.z.string().min(1)).min(1) });
    const { names } = schema.parse(req.body);
    const result = await (0, schoolOnboardingService_1.bulkCreateSubjects)(req.user.schoolId, names);
    res.status(201).json(result);
}));
exports.default = router;
