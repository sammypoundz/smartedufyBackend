// Default report card template service.
//
// Creates the school's DEFAULT report card template (isDefault: true) with a
// polished, editable HTML/CSS design whose placeholders are bound at render
// time to the school's real data (school name/logo/address, student, class,
// term, subjects, grades, remarks) via the fixed placeholder schema used by
// reportCardRenderService ({{school.name}}, {{student.name}}, row.* etc.).
//
// The template is created APPROVED so it can be assigned to classes straight
// away, and the school's logo (if any) is baked into the HTML as the header
// image. It is fully editable afterwards from the Report Designer editor.

import prisma from "../config/prisma";
import {
  sanitizeTemplateHtml,
  sanitizeTemplateCss,
} from "./reportTemplateService";

const DEFAULT_CSS = `
  .rc { width: 100%; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
  .rc-header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; }
  .rc-logo { width: 64px; height: 64px; border-radius: 12px; object-fit: contain; }
  .rc-school-name { font-size: 20px; font-weight: 800; color: #1d4ed8; margin: 0; }
  .rc-school-meta { font-size: 11px; color: #475569; margin: 2px 0 0 0; }
  .rc-title { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin: 14px 0; color: #0f172a; }
  .rc-info { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 12px; }
  .rc-info div { font-size: 12px; }
  .rc-info b { color: #475569; font-weight: 600; }
  table.rc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rc-table th, .rc-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; }
  .rc-table th { background: #dbeafe; color: #1e3a8a; font-weight: 700; }
  .rc-table td:first-child, .rc-table th:first-child { text-align: left; }
  .rc-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
  .rc-summary div { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; text-align: center; font-size: 12px; }
  .rc-summary b { display: block; font-size: 15px; color: #1d4ed8; }
  .rc-remarks { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; font-size: 12px; }
  .rc-remarks div { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; min-height: 56px; }
  .rc-footer { display: flex; justify-content: space-between; margin-top: 22px; font-size: 11px; color: #475569; }
  .rc-footer span { border-top: 1px solid #94a3b8; padding-top: 4px; width: 30%; text-align: center; }
`;

function defaultHtml(school: {
  name: string;
  logoUrl: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}): string {
  return `
  <div class="rc">
    <div class="rc-header">
      ${school.logoUrl ? `<img class="rc-logo" src="${school.logoUrl}" alt="logo" />` : ""}
      <div>
        <h1 class="rc-school-name">{{school.name}}</h1>
        <p class="rc-school-meta">{{school.address}} · {{school.phone}} · {{school.email}}</p>
      </div>
    </div>
    <p class="rc-title">{{term.name}} Report Card — {{session.year}}</p>

    <div class="rc-info">
      <div><b>Student:</b> {{student.name}}</div>
      <div><b>Admission No:</b> {{student.admissionNumber}}</div>
      <div><b>Class:</b> {{student.className}} {{student.armName}}</div>
      <div><b>Gender:</b> {{student.gender}}</div>
      <div><b>Position:</b> {{results.position}} of {{results.studentCount}}</div>
      <div><b>Attendance:</b> {{attendance.present}}/{{attendance.total}} ({{attendance.percentage}})</div>
    </div>

    <table class="rc-table">
      <thead>
        <tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th></tr>
      </thead>
      <tbody data-dynamic-rows="results.rows">
        <tr><td>{{row.subject}}</td><td>{{row.ca}}</td><td>{{row.exam}}</td><td>{{row.total}}</td><td>{{row.grade}}</td><td>{{row.remark}}</td></tr>
      </tbody>
    </table>

    <div class="rc-summary">
      <div>Subjects Offered<b>{{results.subjectCount}}</b></div>
      <div>Total Score<b>{{results.totalScore}}</b></div>
      <div>Average<b>{{results.average}}</b></div>
      <div>Overall Grade<b>{{results.overallGrade}}</b></div>
    </div>

    <div class="rc-remarks">
      <div><b>Teacher's Remark:</b> {{remarks.teacher}}</div>
      <div><b>Principal's Remark:</b> {{remarks.principal}}</div>
    </div>

    <p class="rc-school-meta" style="margin-top:10px">Next term begins: {{term.nextTermBegins}} · Generated: {{generated.date}}</p>
    <div class="rc-footer">
      <span>Class Teacher</span>
      <span>Principal</span>
      <span>Parent</span>
    </div>
  </div>
  `;
}

export const defaultReportTemplateService = {
  /**
   * Ensure the school has a DEFAULT report card template. Creates it (with
   * the school's real data baked in) only when one doesn't exist yet;
   * returns the existing one otherwise.
   */
  async ensureDefault(schoolId: string, userId?: string) {
    const existing = await prisma.reportCardTemplate.findFirst({
      where: { schoolId, isDefault: true },
    });
    if (existing) return { created: false, template: existing };

    // The School model stores name + logoUrl only. Contact info (phone/
    // email) comes from the school's first active ADMIN user instead.
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, logoUrl: true },
    });
    const admin = await prisma.user.findFirst({
      where: { schoolId, role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { phone: true, email: true },
    });
    const schoolData = {
      name: school?.name || "My School",
      logoUrl: school?.logoUrl || null,
      address: "",
      phone: admin?.phone || "",
      email: admin?.email || "",
    };

    const template = await prisma.reportCardTemplate.create({
      data: {
        name: `${schoolData.name} Default Report Card`,
        description:
          "Built-in SmartEdufy default template, pre-filled with your school's details. Fully editable.",
        academicLevel: "OTHER",
        status: "APPROVED",
        isDefault: true,
        htmlTemplate: sanitizeTemplateHtml(defaultHtml(schoolData)),
        cssTemplate: sanitizeTemplateCss(DEFAULT_CSS),
        fieldMappings: JSON.stringify({}),
        tableConfigurations: JSON.stringify({}),
        pageConfigurations: JSON.stringify({
          size: "A4",
          orientation: "portrait",
          marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
        }),
        createdBy: userId || undefined,
        approvedBy: userId || undefined,
        approvedAt: new Date(),
        schoolId,
      } as any,
    });

    return { created: true, template };
  },

  /** Save manual editor edits to a template's HTML/CSS (version-bumped). */
  async saveEdits(
    id: string,
    schoolId: string,
    input: { htmlTemplate?: string; cssTemplate?: string },
  ) {
    const tpl = await prisma.reportCardTemplate.findFirst({
      where: { id, schoolId },
    });
    if (!tpl)
      throw Object.assign(new Error("Template not found"), { status: 404 });

    const history = JSON.parse(tpl.previousVersions || "[]");
    history.push({
      version: tpl.version,
      html: tpl.htmlTemplate,
      css: tpl.cssTemplate,
      savedAt: new Date().toISOString(),
      note: "pre-editor",
    });

    return prisma.reportCardTemplate.update({
      where: { id },
      data: {
        htmlTemplate: input.htmlTemplate
          ? sanitizeTemplateHtml(input.htmlTemplate)
          : undefined,
        cssTemplate: input.cssTemplate
          ? sanitizeTemplateCss(input.cssTemplate)
          : undefined,
        version: { increment: 1 },
        previousVersions: JSON.stringify(history.slice(-9)),
        generationMetadata: JSON.stringify({
          lastAction: "EDITOR_SAVE",
          savedAt: new Date().toISOString(),
        }),
      },
    });
  },
};
