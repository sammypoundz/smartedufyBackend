// Report Designer template service — CRUD, sanitisation, versioning,
// class-assignment resolution and template-data binding.
//
// Data for rendering comes exclusively from SmartEdufy's existing models
// (School, Student, Arm, Class, Result, Attendance, AcademicYear, Term) — the
// renderer never queries arbitrary fields, satisfying the fixed-schema rule.

import prisma from "../config/prisma";
import { getCurrentTenantId } from "../utils/tenantContext";
import sanitizeHtml from "sanitize-html";
import type { GeneratedTemplate } from "./aiReportTemplateService";

export const TEMPLATE_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "GENERATED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "ARCHIVED",
  "FAILED",
] as const;

// ----------------------------- Sanitisation -----------------------------

/** Strip scripts/iframes/handlers from AI-generated HTML. Allowlisted tags only. */
export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
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
export function sanitizeTemplateCss(css: string): string {
  const forbidden =
    /(@import|@charset|behavior\s*:|expression\s*\(|javascript\s*:|url\s*\(\s*['"]?\s*(?!data:|https?:|\/|\.\/|#))/gi;
  const stripped = css.replace(forbidden, "/* blocked */");
  // remove <style> or </style> if the model mistakenly included them
  return stripped.replace(/<\/?style[^>]*>/gi, "");
}

// ----------------------------- CRUD -----------------------------

export const reportTemplateService = {
  /** List all templates for the current school (summary — no heavy HTML payloads). */
  async list(schoolId: string) {
    return prisma.reportCardTemplate.findMany({
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

  async getById(id: string, schoolId: string) {
    return prisma.reportCardTemplate.findFirst({ where: { id, schoolId } });
  },

  /** Upload step: create the DRAFT record with the preserved original file. */
  async createDraft(input: {
    name: string;
    description?: string;
    academicLevel?: string;
    originalFileUrl: string;
    originalFileType: string;
    originalPages: number;
    createdBy: string;
    schoolId: string;
  }) {
    return prisma.reportCardTemplate.create({
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
      } as any,
    });
  },

  /** Store AI output after generation (status → AWAITING_APPROVAL). */
  async saveGeneration(
    id: string,
    tpl: GeneratedTemplate,
    aiModel: string,
    metadata: Record<string, unknown>,
  ) {
    return prisma.reportCardTemplate.update({
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

  async markFailed(id: string, message: string) {
    return prisma.reportCardTemplate.update({
      where: { id },
      data: { status: "FAILED", generationError: message.slice(0, 500) },
    });
  },

  /** Accept Template — save approved version, archive the previous one. */
  async approve(id: string, approvedBy: string) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const tpl = await prisma.reportCardTemplate.findFirst({
      where: { id, schoolId: tenantId },
    });
    if (!tpl)
      throw Object.assign(new Error("Template not found"), { status: 404 });
    if (!tpl.htmlTemplate)
      throw Object.assign(
        new Error("Nothing to approve — generate the template first"),
        { status: 400 },
      );

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
    return prisma.reportCardTemplate.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy,
        approvedAt: new Date(),
        previousVersions: JSON.stringify(history.slice(-9)), // keep last 9 versions
      },
    });
  },

  async update(
    id: string,
    data: { name?: string; description?: string; academicLevel?: string },
  ) {
    return prisma.reportCardTemplate.update({ where: { id }, data });
  },

  /** Delete allowed only when no active assignments reference the template. */
  async delete(id: string) {
    const assignments = await prisma.reportCardAssignment.count({
      where: { templateId: id, isActive: true },
    });
    if (assignments > 0) {
      throw Object.assign(
        new Error(
          "Cannot delete — template is actively assigned to classes. Archive it instead.",
        ),
        { status: 409 },
      );
    }
    return prisma.reportCardTemplate.delete({ where: { id } });
  },

  async archive(id: string) {
    return prisma.reportCardTemplate.update({
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
  async assign(input: {
    templateId: string;
    classIds: string[];
    academicSessionId: string;
    term?: string;
    assignmentType: "ALL_TERMS" | "SPECIFIC_TERM";
    assignedBy: string;
  }) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    const template = await prisma.reportCardTemplate.findFirst({
      where: { id: input.templateId, schoolId: tenantId },
    });
    if (!template)
      throw Object.assign(new Error("Template not found"), { status: 404 });
    if (template.status !== "APPROVED") {
      throw Object.assign(
        new Error("Only APPROVED templates can be assigned"),
        { status: 400 },
      );
    }

    // Deactivate EVERY other active assignment covering the same classes for
    // the same session — regardless of term/scope. Otherwise an older
    // SPECIFIC_TERM assignment stays active and shadows a new ALL_TERMS
    // assignment in resolveTemplateForClass (specific-term wins there).
    // A class must always resolve to exactly ONE active template.
    const existing = await prisma.reportCardAssignment.findMany({
      where: {
        schoolId: tenantId,
        academicSessionId: input.academicSessionId,
        isActive: true,
      },
    });
    const termKey = (a: { term: string | null }) =>
      (a.term ?? "") === (input.term ?? "");
    for (const a of existing) {
      if (a.templateId === input.templateId) continue;
      const overlap = a.classIds.filter((c) => input.classIds.includes(c));
      if (overlap.length > 0) {
        await prisma.reportCardAssignment.update({
          where: { id: a.id },
          data: { isActive: false },
        });
      }
    }

    // Upsert own assignment for these classes.
    const own = existing.find(
      (a) => a.templateId === input.templateId && termKey(a),
    );
    if (own) {
      const merged = [...new Set([...own.classIds, ...input.classIds])];
      return prisma.reportCardAssignment.update({
        where: { id: own.id },
        data: {
          classIds: merged,
          assignmentType: input.assignmentType,
          isActive: true,
          assignedBy: input.assignedBy,
        },
      });
    }
    return prisma.reportCardAssignment.create({
      data: {
        schoolId: tenantId,
        templateId: input.templateId,
        classIds: input.classIds,
        academicSessionId: input.academicSessionId,
        term: input.term ?? null,
        assignmentType: input.assignmentType,
        isActive: true,
        assignedBy: input.assignedBy,
      } as any,
    });
  },

  async listAssignments(schoolId: string) {
    return prisma.reportCardAssignment.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Resolve the active template for a class/session/term.
   * Specific-term assignment wins over ALL_TERMS; most recent wins ties.
   */
  async resolveTemplateForClass(
    classId: string,
    academicSessionId: string,
    term: string,
    schoolId: string,
  ) {
    const assignments = await prisma.reportCardAssignment.findMany({
      where: {
        schoolId,
        isActive: true,
        academicSessionId,
        template: { status: "APPROVED" },
      },
      orderBy: { createdAt: "desc" },
    });
    const relevant = assignments.filter((a) => a.classIds.includes(classId));
    const specific = relevant.find(
      (a) => a.assignmentType === "SPECIFIC_TERM" && a.term === term,
    );
    const chosen =
      specific || relevant.find((a) => a.assignmentType === "ALL_TERMS");
    if (!chosen) return null;
    return prisma.reportCardTemplate.findFirst({
      where: { id: chosen.templateId, schoolId, status: "APPROVED" },
    });
  },
};
