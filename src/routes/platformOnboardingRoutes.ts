// MODULE 9 — Onboarding Center API endpoints (mounted at /api/platform/onboarding).
import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../config/prisma";
import {
  platformAuth,
  requirePlatformRole,
  PlatformAuthRequest,
} from "../middleware/platformAuth";
import {
  parseSpreadsheet,
  extractFromImage,
  validateAgainstSchool,
  registerApprovedStudents,
} from "../services/onboardingService";
import { logAiUsage } from "../services/aiUsageService";
import { logPlatformActivity } from "../services/platformAuditService";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
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
    if (ok) cb(null, true);
    else
      cb(new Error("Unsupported file type. Upload images, CSV, XLSX or PDF."));
  },
});

const asyncRoute =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: any, res: Response) => {
    fn(req, res).catch((e: any) => {
      console.error("onboarding route error:", e.message);
      res
        .status(e.status || 500)
        .json({ error: e.message || "Internal server error" });
    });
  };

// Step 1+2+3+4: upload -> extract -> validate -> persist batch & records for review
router.post(
  "/",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  upload.single("file"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const started = Date.now();
    const schoolId = String(req.body.schoolId || "");
    if (!schoolId)
      return res.status(400).json({ error: "schoolId is required" });
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return res.status(404).json({ error: "School not found" });

    const file = (req as any).file;
    if (!file)
      return res
        .status(400)
        .json({ error: 'No file uploaded. Attach the document as "file".' });

    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype,
    );
    const isSpreadsheet =
      file.mimetype === "text/csv" ||
      file.mimetype.includes("excel") ||
      file.mimetype.includes("spreadsheet");

    let extracted: any[] = [];
    let source = "AI";
    let aiCostNgn = 0;

    try {
      if (isSpreadsheet) {
        source = "SPREADSHEET";
        extracted = parseSpreadsheet(file.buffer);
        if (!extracted.length) {
          return res
            .status(422)
            .json({
              error:
                'Could not find a "Name" column in the spreadsheet. Ensure the first row is a header row with a Name column.',
            });
        }
      } else if (isImage) {
        const result = await extractFromImage(file.buffer, file.mimetype);
        extracted = result.students;
        aiCostNgn = result.costUsd * 1600; // rough internal estimate; refine with settings rate
        await logAiUsage({
          schoolId: null, // platform-internal expense (billing rules: no wallet deduction)
          userId: null,
          operation: "ONBOARDING_EXTRACT",
          model: result.model,
          status: "SUCCESS",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          costUsdEstimated: true,
          processingMs: Date.now() - started,
        });
      } else {
        return res
          .status(400)
          .json({
            error:
              "PDF extraction is not yet supported. Upload images, CSV or XLSX.",
          });
      }
    } catch (err: any) {
      await logAiUsage({
        operation: "ONBOARDING_EXTRACT",
        model: "gemini-flash",
        status: "FAILED",
        errorMessage: err.message,
        processingMs: Date.now() - started,
      });
      throw err;
    }

    // Step 4 — validate against the school's data
    const validated = await validateAgainstSchool(schoolId, extracted);

    // Persist the batch + records for review (Step 5)
    const batch = await prisma.onboardingBatch.create({
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
        adminId: req.platformUser!.id,
        adminName: req.platformUser!.name,
      },
    });
    await prisma.onboardingRecord.createMany({
      data: validated.map((v) => ({
        batchId: batch.id,
        name: v.name,
        gender: v.gender || undefined,
        religion: v.religion || undefined,
        className: v.className || undefined,
        admissionNumber: v.admissionNumber || undefined,
        dateOfBirth:
          v.dateOfBirth && !isNaN(Date.parse(v.dateOfBirth))
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

    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "ONBOARDING_UPLOAD",
      targetType: "OnboardingBatch",
      targetId: batch.id,
      description: `Extracted ${extracted.length} students for ${school.name} from ${file.originalname}`,
      ipAddress: req.ip,
    });

    const records = await prisma.onboardingRecord.findMany({
      where: { batchId: batch.id },
      orderBy: { createdAt: "asc" },
    });
    res.status(201).json({ batch, records });
  }),
);

// List batches
router.get(
  "/",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (_req, res) => {
    const batches = await prisma.onboardingBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(batches);
  }),
);

// Get batch + records
router.get(
  "/:id",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (req, res) => {
    const batch = await prisma.onboardingBatch.findUnique({
      where: { id: String(req.params.id) },
      include: { records: { orderBy: { createdAt: "asc" } } },
    });
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    res.json(batch);
  }),
);

// Update a single record (review corrections)
router.patch(
  "/records/:id",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      gender: z.string().nullable().optional(),
      religion: z.string().nullable().optional(),
      className: z.string().nullable().optional(),
      admissionNumber: z.string().nullable().optional(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    });
    const data = schema.parse(req.body);
    const record = await prisma.onboardingRecord.update({
      where: { id: String(req.params.id) },
      data,
    });
    res.json(record);
  }),
);

// Approve all validated (non-duplicate, non-rejected) records in a batch
router.post(
  "/:id/approve-all",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (req, res) => {
    const batchId = String(req.params.id);
    const result = await prisma.onboardingRecord.updateMany({
      where: { batchId, status: "PENDING", flags: { has: "NOT_A_FLAG" } },
      data: { status: "APPROVED" },
    });
    res.json({ approved: result.count });
  }),
);

// Step 6+7 — bulk register approved students & produce report
router.post(
  "/:id/register",
  platformAuth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const batchId = String(req.params.id);
    const batch = await prisma.onboardingBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const report = await registerApprovedStudents(batch.schoolId, batchId, {
      id: req.platformUser!.id,
      name: req.platformUser!.name,
    });
    res.json(report);
  }),
);

export default router;
