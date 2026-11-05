// Report card rendering engine.
//
// 1. buildTemplateData — collects a student's real academic data from the
//    existing SmartEdufy models and produces the fixed placeholder schema.
// 2. renderHtml       — binds the data into the approved HTML/CSS template
//    (dynamic rows cloned from the AI-generated prototype row; sanitised).
// 3. renderPdf        — Puppeteer renders the bound HTML to a PDF matching the
//    template's page configuration (A4/letter, portrait/landscape, margins).
//
// No arbitrary DB access: only the fixed schema placeholders are bound.

import prisma from "../config/prisma";
import type puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import {
  sanitizeTemplateHtml,
  sanitizeTemplateCss,
} from "./reportTemplateService";

const REPORT_CARD_DIR = "uploads/report-cards";
if (!fs.existsSync(REPORT_CARD_DIR))
  fs.mkdirSync(REPORT_CARD_DIR, { recursive: true });

// ------------------------- Template data builder -------------------------

export interface ReportTemplateData {
  school: {
    name: string;
    logoUrl: string;
    address: string;
    phone: string;
    email: string;
  };
  student: {
    name: string;
    admissionNumber: string;
    photoUrl: string;
    gender: string;
    className: string;
    armName: string;
  };
  session: { year: string };
  term: { name: string; nextTermBegins: string };
  attendance: {
    present: number;
    absent: number;
    total: number;
    percentage: string;
  };
  results: {
    rows: Array<{
      subject: string;
      ca: string;
      exam: string;
      total: string;
      grade: string;
      remark: string;
    }>;
    subjectCount: number;
    totalScore: string;
    average: string;
    overallGrade: string;
    position: string;
    studentCount: string;
  };
  remarks: { teacher: string; principal: string };
  signatures: { teacher: string; principal: string; stamp: string };
  generated: { date: string };
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Gather everything the template placeholders can bind to — from existing models only. */
export async function buildTemplateData(opts: {
  studentId: string;
  academicSessionId: string;
  term: string;
}): Promise<ReportTemplateData> {
  const student = await prisma.student.findUnique({
    where: { id: opts.studentId },
    include: {
      class: { select: { name: true } },
      arm: { select: { letter: true } },
      user: { select: { photoUrl: true } },
    } as any,
  });
  if (!student)
    throw Object.assign(new Error("Student not found"), { status: 404 });

  const school = await prisma.school.findUnique({
    where: { id: student.schoolId },
    select: { name: true, logoUrl: true },
  });

  const session = await prisma.academicYear.findUnique({
    where: { id: opts.academicSessionId },
  });

  // Subject results for this student/term/session — same data source the
  // result compiler and broadsheet use.
  const results = await prisma.result.findMany({
    where: {
      studentId: opts.studentId,
      term: opts.term,
      academicYearId: opts.academicSessionId,
    },
    include: { subject: { select: { name: true } } },
    orderBy: { subjectId: "asc" },
  });

  const rows = results.map((r) => ({
    subject: r.subject?.name || "—",
    ca: String(r.ca),
    exam: String(r.exam),
    total: String(r.total),
    grade: r.grade || "—",
    remark: gradeRemark(r.total),
  }));

  const totalScore = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const subjectCount = rows.length;
  const average = subjectCount > 0 ? totalScore / subjectCount : 0;

  // Class position + size: rank students in the same arm by total score.
  let position = "—";
  let studentCount = "—";
  if (student.armId) {
    const armResults = await prisma.result.findMany({
      where: {
        armId: student.armId,
        term: opts.term,
        academicYearId: opts.academicSessionId,
      },
      select: { studentId: true, total: true },
    });
    const totals = new Map<string, number>();
    for (const r of armResults)
      totals.set(r.studentId, (totals.get(r.studentId) || 0) + r.total);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    studentCount = String(ranked.length);
    const idx = ranked.findIndex(([sid]) => sid === opts.studentId);
    if (idx >= 0) position = ordinal(idx + 1);
  }

  // Attendance for the term (dates in this session).
  let present = 0,
    absent = 0;
  if (session) {
    const termName = opts.term;
    const start = session.createdAt;
    const attendance = await prisma.attendance.findMany({
      where: { studentId: opts.studentId, date: { gte: start } },
      select: { present: true, date: true },
    });
    for (const a of attendance) a.present ? present++ : absent++;
    void termName;
  }

  const overall = average > 0 ? await gradeFor(average, student.classId) : "—";

  const termInfo = await prisma.term.findFirst({
    where: {
      academicYearId: opts.academicSessionId,
      schoolId: student.schoolId,
      name: opts.term,
    },
  });

  return {
    school: {
      name: esc(school?.name || ""),
      logoUrl: esc(school?.logoUrl || ""),
      address: "", // school model has no address field — template keeps static text
      phone: "",
      email: "",
    },
    student: {
      name: esc(student.name),
      admissionNumber: esc(student.admissionNumber || ""),
      photoUrl: esc((student as any).user?.photoUrl || ""),
      gender: esc(student.gender),
      className: esc((student as any).class?.name || ""),
      armName: esc((student as any).arm?.letter || ""),
    },
    session: { year: esc(session?.name || "") },
    term: { name: esc(termInfo?.name || opts.term), nextTermBegins: "" },
    attendance: {
      present,
      absent,
      total: present + absent,
      percentage:
        present + absent > 0
          ? `${Math.round((present / (present + absent)) * 100)}%`
          : "—",
    },
    results: {
      rows,
      subjectCount,
      totalScore: String(totalScore),
      average: average.toFixed(1),
      overallGrade: overall,
      position,
      studentCount,
    },
    remarks: { teacher: "", principal: "" },
    signatures: { teacher: "", principal: "", stamp: "" },
    generated: { date: new Date().toLocaleDateString("en-GB") },
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function gradeRemark(total: number): string {
  if (total >= 75) return "Excellent";
  if (total >= 65) return "Very Good";
  if (total >= 50) return "Good";
  if (total >= 45) return "Fair";
  return "Needs improvement";
}

/** Grade letter via the school's grading scales (same logic as resultService.computeGrade). */
async function gradeFor(
  score: number,
  classId?: string | null,
): Promise<string> {
  let scales;
  if (classId) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { gradingScaleGroupId: true },
    });
    if (cls?.gradingScaleGroupId) {
      scales = await prisma.gradingScale.findMany({
        where: { groupId: cls.gradingScaleGroupId },
        orderBy: { minScore: "desc" },
      });
    }
  }
  if (!scales)
    scales = await prisma.gradingScale.findMany({
      where: { groupId: null },
      orderBy: { minScore: "desc" },
    });
  for (const s of scales) {
    if (score >= s.minScore && score <= s.maxScore) return s.grade;
  }
  return "—";
}

// ------------------------------ Data binding ------------------------------

/** Fill simple {{placeholders}} (everything except the dynamic rows token). */
function bindSimple(html: string, data: ReportTemplateData): string {
  return html.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim();
    if (k === "results.rows") return match; // handled by bindRows
    const parts = k.split(".");
    let cur: any = data;
    for (const p of parts) cur = cur?.[p];
    return cur === undefined || cur === null ? "" : String(cur);
  });
}

/**
 * Clone the prototype <tr> inside <tbody data-dynamic-rows="results.rows">
 * once per subject, binding row.* placeholders.
 */
function bindRows(html: string, data: ReportTemplateData): string {
  const tbodyRe =
    /<tbody[^>]*data-dynamic-rows=["']?results\.rows["']?[^>]*>([\s\S]*?)<\/tbody>/gi;
  return html.replace(tbodyRe, (_m, inner: string) => {
    const trMatch = inner.match(/<tr[\s\S]*?<\/tr>/i);
    const prototype = trMatch ? trMatch[0] : "";
    const cloned = data.results.rows
      .map((row) =>
        prototype
          .replace(/\{\{\s*row\.(\w+)\s*\}\}/g, (_mm, field: string) =>
            String((row as any)[field] ?? ""),
          )
          .replace(/\{\{results\.rows\}\}/g, ""),
      )
      .join("");
    return `<tbody>${cloned || inner.replace(/\{\{[^}]+\}\}/g, "")}</tbody>`;
  });
}

/** Produce the final, self-contained HTML document for preview or PDF. */
export function renderTemplateHtml(
  template: { htmlTemplate: string; cssTemplate: string },
  data: ReportTemplateData,
): string {
  const safeHtml = sanitizeTemplateHtml(template.htmlTemplate || "");
  const safeCss = sanitizeTemplateCss(template.cssTemplate || "");
  const bound = bindRows(bindSimple(safeHtml, data), data);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; }
    img { object-fit: contain; }
    ${safeCss}
  </style></head><body>${bound}</body></html>`;
}

// ------------------------------ PDF rendering ------------------------------

export interface PdfRenderResult {
  buffer: Buffer;
  fileName: string;
}

/** Render bound HTML to PDF with Puppeteer using the template's page config. */
export async function renderPdf(
  boundHtml: string,
  pageConfig: {
    size?: string;
    orientation?: string;
    marginMm?: { top: number; right: number; bottom: number; left: number };
  },
): Promise<Buffer> {
  // Puppeteer v23+ is ESM-only; this module compiles to CommonJS, so use a
  // true dynamic import() instead of a top-level require.
  const puppeteer = (await import("puppeteer")).default ?? (await import("puppeteer"));
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(boundHtml, {
      waitUntil: ("networkidle0" as any),
      timeout: 60_000,
    });
    const margin = pageConfig.marginMm || {
      top: 8,
      right: 8,
      bottom: 8,
      left: 8,
    };
    const pdf = await page.pdf({
      format: (pageConfig.size as any) || "A4",
      landscape: pageConfig.orientation === "landscape",
      printBackground: true,
      margin: {
        top: `${margin.top}mm`,
        right: `${margin.right}mm`,
        bottom: `${margin.bottom}mm`,
        left: `${margin.left}mm`,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Full pipeline: data → bound HTML → PDF saved under uploads/report-cards. */
export async function generateReportCardPdf(opts: {
  template: {
    id: string;
    version: number;
    htmlTemplate: string;
    cssTemplate: string;
    pageConfigurations: string | null;
  };
  studentId: string;
  academicSessionId: string;
  term: string;
  classId: string;
}): Promise<{ fileUrl: string; data: ReportTemplateData; boundHtml: string }> {
  const data = await buildTemplateData({
    studentId: opts.studentId,
    academicSessionId: opts.academicSessionId,
    term: opts.term,
  });
  const boundHtml = renderTemplateHtml(opts.template, data);
  let pageConfig: any = {};
  try {
    pageConfig = JSON.parse(opts.template.pageConfigurations || "{}");
  } catch {
    /* default */
  }

  const buffer = await renderPdf(boundHtml, pageConfig);

  const safeName = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const filePath = path.join(REPORT_CARD_DIR, safeName);
  fs.writeFileSync(filePath, Buffer.from(buffer as unknown as Uint8Array));

  return {
    fileUrl: `/uploads/report-cards/${safeName}`,
    data,
    boundHtml,
  };
}
