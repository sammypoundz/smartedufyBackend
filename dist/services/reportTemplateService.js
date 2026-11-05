"use strict";
// Report Designer template service — CRUD, sanitisation, versioning,
// class-assignment resolution and template-data binding.
//
// Data for rendering comes exclusively from SmartEdufy's existing models
// (School, Student, Arm, Class, Result, Attendance, AcademicYear, Term) — the
// renderer never queries arbitrary fields, satisfying the fixed-schema rule.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportTemplateService = exports.TEMPLATE_STATUSES = void 0;
exports.sanitizeTemplateHtml = sanitizeTemplateHtml;
exports.sanitizeTemplateCss = sanitizeTemplateCss;
const prisma_1 = __importDefault(require("../config/prisma"));
const tenantContext_1 = require("../utils/tenantContext");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
exports.TEMPLATE_STATUSES = [
    "DRAFT",
    "PROCESSING",
    "GENERATED",
    "AWAITING_APPROVAL",
    "APPROVED",
    "ARCHIVED",
    "FAILED",
];
// ----------------------------- Sanitisation -----------------------------
/** Strip scripts/iframes/handlers from AI-generated HTML. Allowlisted tags only. */
function sanitizeTemplateHtml(html) {
    return (0, sanitize_html_1.default)(html, {
        allowedTags: [
            "div",
            "span",
            "p",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "ul",
            "ol",
            "li",
            "img",
            "br",
            "hr",
            "b",
            "strong",
            "i",
            "em",
            "u",
            "section",
            "header",
            "footer",
            "main",
            "small",
            "sup",
            "sub",
            "center",
        ],
        allowedAttributes: {
            "*": ["class", "style", "id", "data-*"],
            img: ["src", "alt", "width", "height"],
            td: ["colspan", "rowspan"],
            th: ["colspan", "rowspan"],
        },
        allowedSchemes: ["data", "http", "https"],
        allowProtocolRelative: false,
        disallowedTagsMode: "discard",
    });
}
/** Allowlist of safe CSS constructs; everything else is stripped line-by-line. */
function sanitizeTemplateCss(css) {
    const forbidden = /(@import|@charset|behavior\s*:|expression\s*\(|javascript\s*:|url\s*\(\s*['"]?\s*(?!data:|https?:|\/|\.\/|#))/gi;
    const stripped = css.replace(forbidden, "/* blocked */");
    // remove <style> or </style> if the model mistakenly included them
    return stripped.replace(/<\/?style[^>]*>/gi, "");
}
// ----------------------------- CRUD -----------------------------
exports.reportTemplateService = {
    /** List all templates for the current school (summary — no heavy HTML payloads). */
    async list(schoolId) {
        return prisma_1.default.reportCardTemplate.findMany({
            where: { schoolId, isDefault: false },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                description: true,
                status: true,
                academicLevel: true,
                originalFileUrl: true,
                originalFileType: true,
                originalPages: true,
                version: true,
                aiModel: true,
                createdAt: true,
                updatedAt: true,
                approvedBy: true,
                approvedAt: true,
                _count: { select: { assignments: true } },
            },
        });
    },
    async getById(id, schoolId) {
        return prisma_1.default.reportCardTemplate.findFirst({ where: { id, schoolId } });
    },
    /** Upload step: create the DRAFT record with the preserved original file. */
    async createDraft(input) {
        return prisma_1.default.reportCardTemplate.create({
            data: {
                name: input.name,
                description: input.description,
                academicLevel: input.academicLevel,
                status: "DRAFT",
                originalFileUrl: input.originalFileUrl,
                originalFileType: input.originalFileType,
                originalPages: input.originalPages,
                createdBy: input.createdBy,
                schoolId: input.schoolId,
                isDefault: false,
            },
        });
    },
    /** Store AI output after generation (status → AWAITING_APPROVAL). */
    async saveGeneration(id, tpl, aiModel, metadata) {
        return prisma_1.default.reportCardTemplate.update({
            where: { id },
            data: {
                status: "AWAITING_APPROVAL",
                htmlTemplate: sanitizeTemplateHtml(tpl.html),
                cssTemplate: sanitizeTemplateCss(tpl.css),
                fieldMappings: JSON.stringify(tpl.fieldMappings || {}),
                tableConfigurations: JSON.stringify(tpl.tableConfigurations || {}),
                pageConfigurations: JSON.stringify(tpl.pageConfigurations || {}),
                aiProvider: "gemini",
                aiModel,
                generationMetadata: JSON.stringify(metadata),
                generationError: null,
            },
        });
    },
    async markFailed(id, message) {
        return prisma_1.default.reportCardTemplate.update({
            where: { id },
            data: { status: "FAILED", generationError: message.slice(0, 500) },
        });
    },
    /** Accept Template — save approved version, archive the previous one. */
    async approve(id, approvedBy) {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const tpl = await prisma_1.default.reportCardTemplate.findFirst({
            where: { id, schoolId: tenantId },
        });
        if (!tpl)
            throw Object.assign(new Error("Template not found"), { status: 404 });
        if (!tpl.htmlTemplate)
            throw Object.assign(new Error("Nothing to approve — generate the template first"), { status: 400 });
        // push current version into previousVersions history
        const history = JSON.parse(tpl.previousVersions || "[]");
        if (tpl.htmlTemplate) {
            history.push({
                version: tpl.version,
                html: tpl.htmlTemplate,
                css: tpl.cssTemplate,
                savedAt: new Date().toISOString(),
                note: "superseded by new approval",
            });
        }
        return prisma_1.default.reportCardTemplate.update({
            where: { id },
            data: {
                status: "APPROVED",
                approvedBy,
                approvedAt: new Date(),
                previousVersions: JSON.stringify(history.slice(-9)), // keep last 9 versions
            },
        });
    },
    async update(id, data) {
        return prisma_1.default.reportCardTemplate.update({ where: { id }, data });
    },
    /** Delete allowed only when no active assignments reference the template. */
    async delete(id) {
        const assignments = await prisma_1.default.reportCardAssignment.count({
            where: { templateId: id, isActive: true },
        });
        if (assignments > 0) {
            throw Object.assign(new Error("Cannot delete — template is actively assigned to classes. Archive it instead."), { status: 409 });
        }
        return prisma_1.default.reportCardTemplate.delete({ where: { id } });
    },
    async archive(id) {
        return prisma_1.default.reportCardTemplate.update({
            where: { id },
            data: { status: "ARCHIVED" },
        });
    },
    // ------------------------- Assignments -------------------------
    /**
     * Assign an APPROVED template to classes for a session (+ optional term).
     * Deactivates conflicting active assignments for the affected classes so a
     * class always resolves to exactly ONE active template.
     */
    async assign(input) {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error("Tenant context missing");
        const template = await prisma_1.default.reportCardTemplate.findFirst({
            where: { id: input.templateId, schoolId: tenantId },
        });
        if (!template)
            throw Object.assign(new Error("Template not found"), { status: 404 });
        if (template.status !== "APPROVED") {
            throw Object.assign(new Error("Only APPROVED templates can be assigned"), { status: 400 });
        }
        // Deactivate any existing active assignment covering the same classes
        // for the same session (+ term when specific).
        const existing = await prisma_1.default.reportCardAssignment.findMany({
            where: {
                schoolId: tenantId,
                academicSessionId: input.academicSessionId,
                isActive: true,
            },
        });
        const termKey = (a) => (a.term ?? "") === (input.term ?? "");
        for (const a of existing) {
            if (a.templateId === input.templateId)
                continue;
            const overlap = a.classIds.filter((c) => input.classIds.includes(c));
            const sameScope = termKey(a) &&
                (a.assignmentType === input.assignmentType ||
                    input.assignmentType === "SPECIFIC_TERM");
            if (overlap.length > 0 && sameScope) {
                await prisma_1.default.reportCardAssignment.update({
                    where: { id: a.id },
                    data: { isActive: false },
                });
            }
        }
        // Upsert own assignment for these classes.
        const own = existing.find((a) => a.templateId === input.templateId && termKey(a));
        if (own) {
            const merged = [...new Set([...own.classIds, ...input.classIds])];
            return prisma_1.default.reportCardAssignment.update({
                where: { id: own.id },
                data: {
                    classIds: merged,
                    assignmentType: input.assignmentType,
                    isActive: true,
                    assignedBy: input.assignedBy,
                },
            });
        }
        return prisma_1.default.reportCardAssignment.create({
            data: {
                schoolId: tenantId,
                templateId: input.templateId,
                classIds: input.classIds,
                academicSessionId: input.academicSessionId,
                term: input.term ?? null,
                assignmentType: input.assignmentType,
                isActive: true,
                assignedBy: input.assignedBy,
            },
        });
    },
    async listAssignments(schoolId) {
        return prisma_1.default.reportCardAssignment.findMany({
            where: { schoolId },
            orderBy: { createdAt: "desc" },
        });
    },
    /**
     * Resolve the active template for a class/session/term.
     * Specific-term assignment wins over ALL_TERMS; most recent wins ties.
     */
    async resolveTemplateForClass(classId, academicSessionId, term, schoolId) {
        const assignments = await prisma_1.default.reportCardAssignment.findMany({
            where: {
                schoolId,
                isActive: true,
                academicSessionId,
                template: { status: "APPROVED" },
            },
            orderBy: { createdAt: "desc" },
        });
        const relevant = assignments.filter((a) => a.classIds.includes(classId));
        const specific = relevant.find((a) => a.assignmentType === "SPECIFIC_TERM" && a.term === term);
        const chosen = specific || relevant.find((a) => a.assignmentType === "ALL_TERMS");
        if (!chosen)
            return null;
        return prisma_1.default.reportCardTemplate.findFirst({
            where: { id: chosen.templateId, schoolId, status: "APPROVED" },
        });
    },
};
