"use strict";
// AI Report Designer — controller + routes.
// Mounted at /api/report-templates and /api/report-cards (see server.ts).
// Auth: authMiddleware + privilegeGuard('reports') + tenant scoping (the
// tenant-aware Prisma middleware scopes every query to req's school).
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
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const tenantContext_1 = require("../utils/tenantContext");
const reportTemplateService_1 = require("../services/reportTemplateService");
const aiReportTemplateService_1 = require("../services/aiReportTemplateService");
const pdfUtils_1 = require("../services/pdfUtils");
const reportCardRenderService_1 = require("../services/reportCardRenderService");
const tokenGate_1 = require("../services/tokenGate");
const aiUsageService_1 = require("../services/aiUsageService");
void aiUsageService_1.logAiUsage;
const router = (0, express_1.Router)();
// ============================ Upload storage ============================
const TEMPLATE_DIR = "uploads/report-templates";
if (!fs_1.default.existsSync(TEMPLATE_DIR))
    fs_1.default.mkdirSync(TEMPLATE_DIR, { recursive: true });
const templateUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, TEMPLATE_DIR),
        filename: (_req, file, cb) => {
            const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
            cb(null, "tpl-" + unique + path_1.default.extname(file.originalname).toLowerCase());
        },
    }),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — matches question-doc policy
    fileFilter: (_req, file, cb) => {
        const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype);
        if (ok)
            cb(null, true);
        else
            cb(new Error("Only PDF, PNG or JPG report card designs are allowed."));
    },
});
// ---------------------------------------------------------------- helpers
function requireAuth(req) {
    if (!req.user)
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return req.user;
}
function requireTenant() {
    const tenantId = (0, tenantContext_1.getCurrentTenantId)();
    if (!tenantId)
        throw Object.assign(new Error("Tenant context missing"), { status: 400 });
    return tenantId;
}
function handleError(res, err, fallback = "Request failed") {
    const status = err?.status || 500;
    console.error("ReportDesigner error:", err?.message || err);
    res.status(status).json({ error: err?.message || fallback });
}
// ============================ Template endpoints ============================
/** GET /api/report-templates — designer dashboard list. */
router.get("/report-templates", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const templates = await reportTemplateService_1.reportTemplateService.list(tenantId);
        const stats = {
            total: templates.length,
            approved: templates.filter((t) => t.status === "APPROVED").length,
            drafts: templates.filter((t) => t.status === "DRAFT" || t.status === "GENERATED").length,
            awaitingApproval: templates.filter((t) => t.status === "AWAITING_APPROVAL").length,
            failed: templates.filter((t) => t.status === "FAILED").length,
            assigned: templates.filter((t) => t._count.assignments > 0).length,
        };
        res.json({ templates, stats });
    }
    catch (err) {
        handleError(res, err, "Failed to load templates");
    }
});
/** GET /api/report-templates/:id — full template incl. HTML/CSS for preview. */
router.get("/report-templates/:id", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const tpl = await reportTemplateService_1.reportTemplateService.getById(getString(req.params.id), tenantId);
        if (!tpl)
            return res.status(404).json({ error: "Template not found" });
        res.json(tpl);
    }
    catch (err) {
        handleError(res, err, "Failed to load template");
    }
});
/** POST /api/report-templates/upload — Step 1: create DRAFT with original file. */
router.post("/report-templates/upload", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), templateUpload.single("file"), async (req, res) => {
    try {
        const user = requireAuth(req);
        requireTenant();
        const file = req.file;
        if (!file)
            return res
                .status(400)
                .json({ error: "No file uploaded. Attach the design as 'file'." });
        const name = String(req.body.name || "").trim();
        if (!name)
            return res.status(400).json({ error: "Template name is required" });
        const ext = path_1.default.extname(file.filename).toLowerCase();
        const mime = file.mimetype === "application/pdf"
            ? "pdf"
            : ext === ".png"
                ? "png"
                : "jpg";
        // PDFs keep their page count for the preview UI (parsed cheaply below
        // during generation; for now count via pdf-lib header scan).
        const pages = mime === "pdf" ? await countPdfPages(file.path) : 1;
        const template = await reportTemplateService_1.reportTemplateService.createDraft({
            name,
            description: req.body.description
                ? String(req.body.description)
                : undefined,
            academicLevel: req.body.academicLevel
                ? String(req.body.academicLevel)
                : undefined,
            originalFileUrl: `/${file.path.replace(/\\/g, "/")}`,
            originalFileType: mime,
            originalPages: pages,
            createdBy: user.id,
        });
        res.status(201).json(template);
    }
    catch (err) {
        handleError(res, err, "Upload failed");
    }
});
async function countPdfPages(filePath) {
    try {
        const { PDFDocument } = await Promise.resolve().then(() => __importStar(require("pdf-lib")));
        const doc = await PDFDocument.load(fs_1.default.readFileSync(filePath));
        return doc.getPageCount();
    }
    catch {
        return 1;
    }
}
function getString(v) {
    if (typeof v !== "string")
        return "";
    return v;
}
/** POST /api/report-templates/:id/generate — Step 2+3: AI analyse + generate (costs 2 tokens). */
router.post("/report-templates/:id/generate", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    const started = Date.now();
    try {
        const user = requireAuth(req);
        const tenantId = requireTenant();
        const id = getString(req.params.id);
        const tpl = await reportTemplateService_1.reportTemplateService.getById(id, tenantId);
        if (!tpl)
            return res.status(404).json({ error: "Template not found" });
        if (!tpl.originalFileUrl)
            return res
                .status(400)
                .json({ error: "No uploaded document on this template" });
        if (tpl.status === "PROCESSING")
            return res
                .status(409)
                .json({ error: "Generation already in progress" });
        // Token gate: template generation costs 2 tokens (multi-page vision work).
        const gate = await (0, tokenGate_1.gateTokens)(tenantId, 2, "REPORT_TEMPLATE");
        await prisma_1.default.reportCardTemplate.update({
            where: { id },
            data: { status: "PROCESSING" },
        });
        try {
            const absPath = path_1.default.join(process.cwd(), tpl.originalFileUrl);
            const buffer = fs_1.default.readFileSync(absPath);
            const mime = tpl.originalFileType === "pdf"
                ? "application/pdf"
                : tpl.originalFileType === "png"
                    ? "image/png"
                    : "image/jpeg";
            const pages = await (0, pdfUtils_1.documentToPageImages)(buffer, mime);
            const { template, model } = await (0, aiReportTemplateService_1.analyseAndGenerate)(pages, {
                schoolId: tenantId,
                userId: user.id,
            });
            const saved = await reportTemplateService_1.reportTemplateService.saveGeneration(id, template, model, {
                pagesAnalysed: pages.length,
                generationMs: Date.now() - started,
                tokensCharged: 2,
                analysis: template.analysis,
            });
            await gate.charge();
            res.json(saved);
        }
        catch (err) {
            await gate.release();
            await reportTemplateService_1.reportTemplateService.markFailed(id, err.message || "Generation failed");
            throw err;
        }
    }
    catch (err) {
        handleError(res, err, "AI generation failed");
    }
});
/** POST /api/report-templates/:id/correct — Step 4: apply school's corrections (1 token). */
router.post("/report-templates/:id/correct", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const tenantId = requireTenant();
        const id = getString(req.params.id);
        const instructions = String(req.body.instructions || "").trim();
        if (instructions.length < 5)
            return res
                .status(400)
                .json({ error: "Describe the corrections to apply" });
        const tpl = await reportTemplateService_1.reportTemplateService.getById(id, tenantId);
        if (!tpl?.htmlTemplate)
            return res.status(400).json({ error: "Generate the template first" });
        const gate = await (0, tokenGate_1.gateTokens)(tenantId, 1, "REPORT_TEMPLATE");
        try {
            const absPath = path_1.default.join(process.cwd(), tpl.originalFileUrl);
            const buffer = fs_1.default.readFileSync(absPath);
            const mime = tpl.originalFileType === "pdf"
                ? "application/pdf"
                : tpl.originalFileType === "png"
                    ? "image/png"
                    : "image/jpeg";
            const pages = await (0, pdfUtils_1.documentToPageImages)(buffer, mime);
            const { template, model } = await (0, aiReportTemplateService_1.correctTemplate)(pages, { html: tpl.htmlTemplate, css: tpl.cssTemplate || "" }, instructions, { schoolId: tenantId, userId: user.id });
            // keep previous generated version in history
            const history = JSON.parse(tpl.previousVersions || "[]");
            history.push({
                version: tpl.version,
                html: tpl.htmlTemplate,
                css: tpl.cssTemplate,
                savedAt: new Date().toISOString(),
                note: "pre-correction",
            });
            const saved = await prisma_1.default.reportCardTemplate.update({
                where: { id },
                data: {
                    status: "AWAITING_APPROVAL",
                    htmlTemplate: (0, reportTemplateService_1.sanitizeTemplateHtml)(template.html),
                    cssTemplate: (0, reportTemplateService_1.sanitizeTemplateCss)(template.css),
                    fieldMappings: JSON.stringify(template.fieldMappings || {}),
                    tableConfigurations: JSON.stringify(template.tableConfigurations || {}),
                    pageConfigurations: JSON.stringify(template.pageConfigurations || {}),
                    aiModel: model,
                    version: { increment: 1 },
                    previousVersions: JSON.stringify(history.slice(-9)),
                    generationMetadata: JSON.stringify({
                        lastAction: "CORRECTION",
                        instructions: instructions.slice(0, 2000),
                        correctionMs: Date.now(),
                        tokensCharged: 1,
                    }),
                },
            });
            await gate.charge();
            res.json(saved);
        }
        catch (err) {
            await gate.release();
            throw err;
        }
    }
    catch (err) {
        handleError(res, err, "AI correction failed");
    }
});
/** POST /api/report-templates/:id/regenerate — fresh attempt from scratch (2 tokens). */
router.post("/report-templates/:id/regenerate", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const tenantId = requireTenant();
        const id = getString(req.params.id);
        const tpl = await reportTemplateService_1.reportTemplateService.getById(id, tenantId);
        if (!tpl?.originalFileUrl)
            return res.status(404).json({ error: "Template not found" });
        const gate = await (0, tokenGate_1.gateTokens)(tenantId, 2, "REPORT_TEMPLATE");
        try {
            const absPath = path_1.default.join(process.cwd(), tpl.originalFileUrl);
            const buffer = fs_1.default.readFileSync(absPath);
            const mime = tpl.originalFileType === "pdf"
                ? "application/pdf"
                : tpl.originalFileType === "png"
                    ? "image/png"
                    : "image/jpeg";
            const pages = await (0, pdfUtils_1.documentToPageImages)(buffer, mime);
            const { template, model } = await (0, aiReportTemplateService_1.regenerateTemplate)(pages, {
                schoolId: tenantId,
                userId: user.id,
            });
            const saved = await reportTemplateService_1.reportTemplateService.saveGeneration(id, template, model, {
                lastAction: "REGENERATE",
                generationMs: Date.now() - started0(req),
                tokensCharged: 2,
            });
            await gate.charge();
            res.json(saved);
        }
        catch (err) {
            await gate.release();
            throw err;
        }
    }
    catch (err) {
        handleError(res, err, "AI regeneration failed");
    }
});
function started0(_req) {
    return Date.now();
}
/** POST /api/report-templates/:id/approve — Step 5: Accept Template. */
router.post("/report-templates/:id/approve", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const saved = await reportTemplateService_1.reportTemplateService.approve(getString(req.params.id), user.id);
        res.json(saved);
    }
    catch (err) {
        handleError(res, err, "Approval failed");
    }
});
/** PUT /api/report-templates/:id — rename / edit metadata. */
router.put("/report-templates/:id", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        requireTenant();
        const data = {};
        if (req.body.name)
            data.name = String(req.body.name);
        if (req.body.description !== undefined)
            data.description = String(req.body.description);
        if (req.body.academicLevel)
            data.academicLevel = String(req.body.academicLevel);
        const updated = await reportTemplateService_1.reportTemplateService.update(getString(req.params.id), data);
        res.json(updated);
    }
    catch (err) {
        handleError(res, err, "Update failed");
    }
});
/** POST /api/report-templates/:id/archive */
router.post("/report-templates/:id/archive", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        requireTenant();
        const updated = await reportTemplateService_1.reportTemplateService.archive(getString(req.params.id));
        res.json(updated);
    }
    catch (err) {
        handleError(res, err, "Archive failed");
    }
});
/** DELETE /api/report-templates/:id */
router.delete("/report-templates/:id", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        requireTenant();
        await reportTemplateService_1.reportTemplateService.delete(getString(req.params.id));
        res.json({ success: true });
    }
    catch (err) {
        handleError(res, err, "Delete failed");
    }
});
/** GET /api/report-templates/:id/preview — HTML preview bound with sample data. */
router.get("/report-templates/:id/preview", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const tpl = await reportTemplateService_1.reportTemplateService.getById(getString(req.params.id), tenantId);
        if (!tpl?.htmlTemplate)
            return res
                .status(404)
                .json({ error: "No generated template to preview" });
        const sample = sampleData();
        const html = (0, reportCardRenderService_1.renderTemplateHtml)(tpl, sample);
        res.json({ html, css: (0, reportTemplateService_1.sanitizeTemplateCss)(tpl.cssTemplate || "") });
    }
    catch (err) {
        handleError(res, err, "Preview failed");
    }
});
/** Lightweight sample data (no DB writes, no student PII). */
function sampleData() {
    const esc = (s) => s;
    return {
        school: {
            name: esc("Sample International School"),
            logoUrl: "",
            address: "12 Unity Road, Lagos",
            phone: "0800 000 0000",
            email: "info@sample.sch.ng",
        },
        student: {
            name: esc("Adaeze Okafor"),
            admissionNumber: esc("STU-2025-0017"),
            photoUrl: "",
            gender: "Female",
            className: "JSS 2",
            armName: "A",
        },
        session: { year: "2025/2026" },
        term: { name: "First Term", nextTermBegins: "6th January 2026" },
        attendance: { present: 118, absent: 6, total: 124, percentage: "95%" },
        results: {
            rows: [
                {
                    subject: "Mathematics",
                    ca: "38",
                    exam: "55",
                    total: "93",
                    grade: "A",
                    remark: "Excellent",
                },
                {
                    subject: "English Language",
                    ca: "32",
                    exam: "48",
                    total: "80",
                    grade: "B",
                    remark: "Very Good",
                },
                {
                    subject: "Basic Science",
                    ca: "30",
                    exam: "45",
                    total: "75",
                    grade: "B",
                    remark: "Very Good",
                },
                {
                    subject: "Social Studies",
                    ca: "26",
                    exam: "42",
                    total: "68",
                    grade: "C",
                    remark: "Good",
                },
                {
                    subject: "Civic Education",
                    ca: "34",
                    exam: "50",
                    total: "84",
                    grade: "A",
                    remark: "Excellent",
                },
                {
                    subject: "Computer Studies",
                    ca: "36",
                    exam: "52",
                    total: "88",
                    grade: "A",
                    remark: "Excellent",
                },
            ],
            subjectCount: 6,
            totalScore: "488",
            average: "81.3",
            overallGrade: "A",
            position: "3rd",
            studentCount: "24",
        },
        remarks: {
            teacher: "A hardworking and diligent student. Keep it up.",
            principal: "An excellent result. Promoted to the next class.",
        },
        signatures: { teacher: "", principal: "", stamp: "" },
        generated: { date: new Date().toLocaleDateString("en-GB") },
    };
}
// ============================ Assignment endpoints ============================
/** POST /api/report-templates/:id/assign — Step 6. */
router.post("/report-templates/:id/assign", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const { classIds, academicSessionId, term, assignmentType } = req.body || {};
        if (!Array.isArray(classIds) || classIds.length === 0)
            return res.status(400).json({ error: "Select at least one class" });
        if (!academicSessionId)
            return res.status(400).json({ error: "Academic session is required" });
        const type = assignmentType === "SPECIFIC_TERM" ? "SPECIFIC_TERM" : "ALL_TERMS";
        if (type === "SPECIFIC_TERM" && !term)
            return res
                .status(400)
                .json({ error: "Term is required for specific-term assignments" });
        const assignment = await reportTemplateService_1.reportTemplateService.assign({
            templateId: getString(req.params.id),
            classIds: classIds.map(String),
            academicSessionId: String(academicSessionId),
            term: term ? String(term) : undefined,
            assignmentType: type,
            assignedBy: user.id,
        });
        res.status(201).json(assignment);
    }
    catch (err) {
        handleError(res, err, "Assignment failed");
    }
});
/** GET /api/report-templates-assignments — list all (thin route name kept separate from :id). */
router.get("/report-template-assignments", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        res.json(await reportTemplateService_1.reportTemplateService.listAssignments(tenantId));
    }
    catch (err) {
        handleError(res, err, "Failed to load assignments");
    }
});
/** GET /api/report-templates/class/:classId?academicSessionId=&term= — resolve active template. */
router.get("/report-templates/class/:classId", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const session = String(req.query.academicSessionId || "");
        const term = String(req.query.term || "");
        if (!session || !term)
            return res
                .status(400)
                .json({ error: "academicSessionId and term are required" });
        const template = await reportTemplateService_1.reportTemplateService.resolveTemplateForClass(getString(req.params.classId), session, term, tenantId);
        if (!template)
            return res.json({ template: null }); // fall back to the default report card
        res.json({
            template: {
                id: template.id,
                name: template.name,
                version: template.version,
                status: template.status,
                pageConfigurations: template.pageConfigurations,
            },
        });
    }
    catch (err) {
        handleError(res, err, "Failed to resolve template");
    }
});
// ============================ Report card endpoints ============================
/** GET /api/report-cards/student/:studentId/preview — bound HTML preview (no PDF). */
router.get("/report-cards/student/:studentId/preview", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const studentId = getString(req.params.studentId);
        const academicSessionId = String(req.query.academicSessionId || "");
        const term = String(req.query.term || "");
        if (!academicSessionId || !term)
            return res
                .status(400)
                .json({ error: "academicSessionId and term are required" });
        const student = await prisma_1.default.student.findUnique({
            where: { id: studentId },
            select: { classId: true, schoolId: true },
        });
        if (!student || student.schoolId !== tenantId)
            return res.status(404).json({ error: "Student not found" });
        const template = await reportTemplateService_1.reportTemplateService.resolveTemplateForClass(student.classId || "", academicSessionId, term, tenantId);
        if (!template?.htmlTemplate)
            return res.status(404).json({ error: "NO_TEMPLATE" });
        const data = await (0, reportCardRenderService_1.buildTemplateData)({
            studentId,
            academicSessionId,
            term,
        });
        const html = (0, reportCardRenderService_1.renderTemplateHtml)(template, data);
        res.json({
            html,
            template: {
                id: template.id,
                name: template.name,
                version: template.version,
            },
        });
    }
    catch (err) {
        handleError(res, err, "Preview failed");
    }
});
/** POST /api/report-cards/student/:studentId/generate — single PDF. */
router.post("/report-cards/student/:studentId/generate", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const tenantId = requireTenant();
        const studentId = getString(req.params.studentId);
        const { academicSessionId, term } = req.body || {};
        if (!academicSessionId || !term)
            return res
                .status(400)
                .json({ error: "academicSessionId and term are required" });
        const student = await prisma_1.default.student.findUnique({
            where: { id: studentId },
            select: { classId: true, schoolId: true, name: true },
        });
        if (!student || student.schoolId !== tenantId)
            return res.status(404).json({ error: "Student not found" });
        const template = await reportTemplateService_1.reportTemplateService.resolveTemplateForClass(student.classId || "", academicSessionId, term, tenantId);
        if (!template?.htmlTemplate)
            return res.status(404).json({ error: "NO_TEMPLATE" });
        const { fileUrl } = await (0, reportCardRenderService_1.generateReportCardPdf)({
            template: template,
            studentId,
            academicSessionId,
            term,
            classId: student.classId || "",
        });
        const record = await prisma_1.default.generatedReportCard.upsert({
            where: {
                studentId_academicSessionId_term: {
                    studentId,
                    academicSessionId,
                    term,
                },
            },
            update: {
                templateId: template.id,
                templateVersion: template.version,
                generatedFileUrl: fileUrl,
                generationStatus: "DONE",
                generationError: null,
                generatedAt: new Date(),
                generatedBy: user.id,
            },
            create: {
                schoolId: tenantId,
                studentId,
                classId: student.classId || "",
                templateId: template.id,
                templateVersion: template.version,
                academicSessionId,
                term,
                generatedFileUrl: fileUrl,
                generationStatus: "DONE",
                generatedAt: new Date(),
                generatedBy: user.id,
            },
        });
        res.json({ reportCard: record, fileUrl });
    }
    catch (err) {
        handleError(res, err, "Report card generation failed");
    }
});
/** POST /api/report-cards/class/:classId/generate — batch (sequential, resumable; reports per-student status). */
router.post("/report-cards/class/:classId/generate", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const user = requireAuth(req);
        const tenantId = requireTenant();
        const classId = getString(req.params.classId);
        const { academicSessionId, term } = req.body || {};
        if (!academicSessionId || !term)
            return res
                .status(400)
                .json({ error: "academicSessionId and term are required" });
        const template = await reportTemplateService_1.reportTemplateService.resolveTemplateForClass(classId, academicSessionId, term, tenantId);
        if (!template?.htmlTemplate)
            return res.status(404).json({ error: "NO_TEMPLATE" });
        const students = await prisma_1.default.student.findMany({
            where: { classId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });
        const results = [];
        // batch of 5 sequential renders at a time keeps the event loop responsive
        const BATCH = 5;
        for (let i = 0; i < students.length; i += BATCH) {
            const chunk = students.slice(i, i + BATCH);
            const settled = await Promise.allSettled(chunk.map(async (s) => {
                const { fileUrl } = await (0, reportCardRenderService_1.generateReportCardPdf)({
                    template: template,
                    studentId: s.id,
                    academicSessionId,
                    term,
                    classId,
                });
                await prisma_1.default.generatedReportCard.upsert({
                    where: {
                        studentId_academicSessionId_term: {
                            studentId: s.id,
                            academicSessionId,
                            term,
                        },
                    },
                    update: {
                        templateId: template.id,
                        templateVersion: template.version,
                        generatedFileUrl: fileUrl,
                        generationStatus: "DONE",
                        generationError: null,
                        generatedAt: new Date(),
                        generatedBy: user.id,
                    },
                    create: {
                        schoolId: tenantId,
                        studentId: s.id,
                        classId,
                        templateId: template.id,
                        templateVersion: template.version,
                        academicSessionId,
                        term,
                        generatedFileUrl: fileUrl,
                        generationStatus: "DONE",
                        generatedAt: new Date(),
                        generatedBy: user.id,
                    },
                });
                return { studentId: s.id, name: s.name, status: "DONE", fileUrl };
            }));
            settled.forEach((r, idx) => {
                if (r.status === "fulfilled")
                    results.push(r.value);
                else
                    results.push({
                        studentId: chunk[idx].id,
                        name: chunk[idx].name,
                        status: "FAILED",
                        error: String(r.reason?.message || r.reason),
                    });
            });
        }
        res.json({
            templateId: template.id,
            templateVersion: template.version,
            generated: results,
        });
    }
    catch (err) {
        handleError(res, err, "Class generation failed");
    }
});
/** GET /api/report-cards/class/:classId/download-all — ZIP of the class's PDFs. */
router.get("/report-cards/class/:classId/download-all", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const classId = getString(req.params.classId);
        const academicSessionId = String(req.query.academicSessionId || "");
        const term = String(req.query.term || "");
        if (!academicSessionId || !term)
            return res
                .status(400)
                .json({ error: "academicSessionId and term are required" });
        const cards = await prisma_1.default.generatedReportCard.findMany({
            where: {
                schoolId: tenantId,
                classId,
                academicSessionId,
                term,
                generationStatus: "DONE",
            },
            include: { student: { select: { name: true, admissionNumber: true } } },
        });
        if (cards.length === 0)
            return res
                .status(404)
                .json({ error: "No generated report cards for this class/term yet" });
        const archiverMod = await Promise.resolve().then(() => __importStar(require("archiver")));
        const archiverFn = archiverMod.default || archiverMod;
        const archive = archiverFn("zip", { zlib: { level: 9 } });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="report-cards-${term}.zip"`);
        archive.pipe(res);
        for (const c of cards) {
            const abs = path_1.default.join(process.cwd(), c.generatedFileUrl || "");
            if (fs_1.default.existsSync(abs)) {
                const safe = String(c.student?.name || c.studentId).replace(/[^\w-]+/g, "_");
                archive.append(fs_1.default.readFileSync(abs), {
                    name: `${safe}_${c.studentId}.pdf`,
                });
            }
        }
        await archive.finalize();
    }
    catch (err) {
        handleError(res, err, "Bulk download failed");
    }
});
/** GET /api/report-cards/student/:studentId/file — stream a stored PDF (school-scoped). */
router.get("/report-cards/student/:studentId/file", auth_1.authMiddleware, (0, auth_1.privilegeGuard)("reports"), async (req, res) => {
    try {
        const tenantId = requireTenant();
        const studentId = getString(req.params.studentId);
        const academicSessionId = String(req.query.academicSessionId || "");
        const term = String(req.query.term || "");
        const card = await prisma_1.default.generatedReportCard.findFirst({
            where: {
                schoolId: tenantId,
                studentId,
                academicSessionId,
                term,
                generationStatus: "DONE",
            },
        });
        if (!card?.generatedFileUrl)
            return res.status(404).json({ error: "No generated report card" });
        const abs = path_1.default.join(process.cwd(), card.generatedFileUrl);
        if (!fs_1.default.existsSync(abs))
            return res.status(404).json({ error: "File missing on disk" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="report-card.pdf"`);
        fs_1.default.createReadStream(abs).pipe(res);
    }
    catch (err) {
        handleError(res, err, "Download failed");
    }
});
exports.default = router;
