"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE 9 — Onboarding Center API endpoints (mounted at /api/platform/onboarding).
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const platformAuth_1 = require("../middleware/platformAuth");
const onboardingService_1 = require("../services/onboardingService");
const aiUsageService_1 = require("../services/aiUsageService");
const platformAuditService_1 = require("../services/platformAuditService");
const tokenGate_1 = require("../services/tokenGate");
const tokenWalletService_1 = require("../services/tokenWalletService");
const platformSettingsService_1 = require("../services/platformSettingsService");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/pdf",
        ].includes(file.mimetype);
        if (ok)
            cb(null, true);
        else
            cb(new Error("Unsupported file type. Upload images, CSV, XLSX or PDF."));
    },
});
const asyncRoute = (fn) => (req, res) => {
    fn(req, res).catch((e) => {
        console.error("onboarding route error:", e.message);
        res
            .status(e.status || 500)
            .json({ error: e.message || "Internal server error" });
    });
};
// Step 1+2+3+4: upload -> extract -> validate -> persist batch & records for review
router.post("/", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), upload.single("file"), asyncRoute(async (req, res) => {
    const started = Date.now();
    const schoolId = String(req.body.schoolId || "");
    if (!schoolId)
        return res.status(400).json({ error: "schoolId is required" });
    const school = await prisma_1.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school)
        return res.status(404).json({ error: "School not found" });
    const file = req.file;
    if (!file)
        return res
            .status(400)
            .json({ error: 'No file uploaded. Attach the document as "file".' });
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    const isSpreadsheet = file.mimetype === "text/csv" ||
        file.mimetype.includes("excel") ||
        file.mimetype.includes("spreadsheet");
    let extracted = [];
    let source = "AI";
    let aiCostNgn = 0;
    try {
        if (isSpreadsheet) {
            source = "SPREADSHEET";
            extracted = (0, onboardingService_1.parseSpreadsheet)(file.buffer);
            if (!extracted.length) {
                return res
                    .status(422)
                    .json({
                    error: 'Could not find a "Name" column in the spreadsheet. Ensure the first row is a header row with a Name column.',
                });
            }
        }
        else if (isImage) {
            // ---- Token gating: AI extraction consumes the school's tokens ----
            // 1 token per student on the document (min 1) — estimated up-front from
            // nothing, so we gate with a flat scan cost and charge by the actual
            // number of students extracted.
            const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
            const gate = await (0, tokenGate_1.gateTokens)(schoolId, 1, "ONBOARDING_EXTRACT");
            let gateCharged = false;
            try {
                const result = await (0, onboardingService_1.extractFromImage)(file.buffer, file.mimetype);
                extracted = result.students;
                aiCostNgn = result.costUsd * tokenPrice;
                await (0, aiUsageService_1.logAiUsage)({
                    schoolId, // billed to the school's wallet, not the platform
                    userId: null,
                    operation: "ONBOARDING_EXTRACT",
                    model: result.model,
                    status: "SUCCESS",
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    costUsd: result.costUsd,
                    costUsdEstimated: true,
                    tokensCharged: Math.max(1, extracted.length),
                    revenueNgn: Math.max(1, extracted.length) * tokenPrice,
                    processingMs: Date.now() - started,
                });
                // Charge 1 token per extracted student (min 1) by releasing the flat
                // reservation and charging the real amount under a fresh reference.
                const actual = Math.max(1, extracted.length);
                await tokenWalletService_1.tokenWalletService.release(schoolId, 1, gate.ref);
                if (actual > 1) {
                    await tokenWalletService_1.tokenWalletService.reserve(schoolId, actual, gate.ref + "-x");
                }
                await tokenWalletService_1.tokenWalletService.charge(schoolId, actual, actual > 1 ? gate.ref + "-x" : gate.ref, { operation: "ONBOARDING_EXTRACT", students: extracted.length });
                gateCharged = true;
            }
            catch (err) {
                if (!gateCharged)
                    await gate.release();
                await (0, aiUsageService_1.logAiUsage)({
                    schoolId,
                    operation: "ONBOARDING_EXTRACT",
                    model: "gemini-flash",
                    status: "FAILED",
                    errorMessage: err.message,
                    processingMs: Date.now() - started,
                });
                throw err;
            }
        }
        else {
            return res
                .status(400)
                .json({
                error: "PDF extraction is not yet supported. Upload images, CSV or XLSX.",
            });
        }
    }
    catch (err) {
        await (0, aiUsageService_1.logAiUsage)({
            operation: "ONBOARDING_EXTRACT",
            model: "gemini-flash",
            status: "FAILED",
            errorMessage: err.message,
            processingMs: Date.now() - started,
        });
        throw err;
    }
    // Step 4 — validate against the school's data
    const validated = await (0, onboardingService_1.validateAgainstSchool)(schoolId, extracted);
    // Persist the batch + records for review (Step 5)
    const batch = await prisma_1.prisma.onboardingBatch.create({
        data: {
            schoolId,
            fileName: file.originalname,
            fileType: file.mimetype,
            status: "EXTRACTED",
            source,
            extracted: extracted.length,
            duplicates: validated.filter((v) => v.flags.includes("DUPLICATE"))
                .length,
            missingInfo: validated.filter((v) => v.flags.includes("MISSING_FIELDS"))
                .length,
            aiCostNgn,
            durationMs: Date.now() - started,
            adminId: req.platformUser.id,
            adminName: req.platformUser.name,
        },
    });
    await prisma_1.prisma.onboardingRecord.createMany({
        data: validated.map((v) => ({
            batchId: batch.id,
            name: v.name,
            gender: v.gender || undefined,
            religion: v.religion || undefined,
            className: v.className || undefined,
            admissionNumber: v.admissionNumber || undefined,
            dateOfBirth: v.dateOfBirth && !isNaN(Date.parse(v.dateOfBirth))
                ? new Date(v.dateOfBirth)
                : undefined,
            parentName: v.parentName || undefined,
            parentPhone: v.parentPhone || undefined,
            parentEmail: v.parentEmail || undefined,
            confidence: v.confidence,
            flags: v.flags,
            status: "PENDING",
        })),
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "ONBOARDING_UPLOAD",
        targetType: "OnboardingBatch",
        targetId: batch.id,
        description: `Extracted ${extracted.length} students for ${school.name} from ${file.originalname}`,
        ipAddress: req.ip,
    });
    const records = await prisma_1.prisma.onboardingRecord.findMany({
        where: { batchId: batch.id },
        orderBy: { createdAt: "asc" },
    });
    res.status(201).json({ batch, records });
}));
// List batches
router.get("/", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (_req, res) => {
    const batches = await prisma_1.prisma.onboardingBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    res.json(batches);
}));
// Get batch + records
router.get("/:id", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: String(req.params.id) },
        include: { records: { orderBy: { createdAt: "asc" } } },
    });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    res.json(batch);
}));
// Update a single record (review corrections)
router.patch("/records/:id", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        gender: zod_1.z.string().nullable().optional(),
        religion: zod_1.z.string().nullable().optional(),
        className: zod_1.z.string().nullable().optional(),
        admissionNumber: zod_1.z.string().nullable().optional(),
        status: zod_1.z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    });
    const data = schema.parse(req.body);
    const record = await prisma_1.prisma.onboardingRecord.update({
        where: { id: String(req.params.id) },
        data,
    });
    res.json(record);
}));
// Approve all validated (non-duplicate, non-rejected) records in a batch
router.post("/:id/approve-all", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const batchId = String(req.params.id);
    const result = await prisma_1.prisma.onboardingRecord.updateMany({
        where: { batchId, status: "PENDING", flags: { has: "NOT_A_FLAG" } },
        data: { status: "APPROVED" },
    });
    res.json({ approved: result.count });
}));
// Step 6+7 — bulk register approved students & produce report
router.post("/:id/register", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const batchId = String(req.params.id);
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: batchId },
    });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    const report = await (0, onboardingService_1.registerApprovedStudents)(batch.schoolId, batchId, {
        id: req.platformUser.id,
        name: req.platformUser.name,
    });
    res.json(report);
}));
// Classes referenced by the batch that don't exist in the target school —
// used by the UI to prompt for confirmation before creating them.
router.get("/:id/missing-classes", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: String(req.params.id) },
    });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    const missing = await (0, onboardingService_1.listMissingClasses)(batch.schoolId, batch.id);
    res.json({ missingClasses: missing });
}));
// Confirm-then-create: create missing classes (each with an "Arm A" arm) so
// students in the batch can be registered into a class+arm immediately.
router.post("/:id/ensure-classes", platformAuth_1.platformAuth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ONBOARDING_OFFICER"), asyncRoute(async (req, res) => {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: String(req.params.id) },
    });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    const result = await (0, onboardingService_1.ensureClassesForBatch)(batch.schoolId, batch.id, {
        id: req.platformUser.id,
        name: req.platformUser.name,
    });
    res.json(result);
}));
exports.default = router;
