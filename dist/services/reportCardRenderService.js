"use strict";
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
exports.buildTemplateData = buildTemplateData;
exports.renderTemplateHtml = renderTemplateHtml;
exports.renderPdf = renderPdf;
exports.generateReportCardPdf = generateReportCardPdf;
const prisma_1 = __importDefault(require("../config/prisma"));
const fs_1 = __importDefault(require("fs"));
const cloudinaryStorage_1 = require("./cloudinaryStorage");
const reportTemplateService_1 = require("./reportTemplateService");
const REPORT_CARD_DIR = "uploads/report-cards";
if (!fs_1.default.existsSync(REPORT_CARD_DIR))
    fs_1.default.mkdirSync(REPORT_CARD_DIR, { recursive: true });
const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
/** Gather everything the template placeholders can bind to — from existing models only. */
async function buildTemplateData(opts) {
    const student = await prisma_1.default.student.findUnique({
        where: { id: opts.studentId },
        include: {
            class: { select: { name: true } },
            arm: { select: { letter: true } },
            user: { select: { photoUrl: true } },
        },
    });
    if (!student)
        throw Object.assign(new Error("Student not found"), { status: 404 });
    const school = await prisma_1.default.school.findUnique({
        where: { id: student.schoolId },
        select: { name: true, logoUrl: true },
    });
    const session = await prisma_1.default.academicYear.findUnique({
        where: { id: opts.academicSessionId },
    });
    // Subject results for this student/term/session — same data source the
    // result compiler and broadsheet use.
    const results = await prisma_1.default.result.findMany({
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
        const armResults = await prisma_1.default.result.findMany({
            where: {
                armId: student.armId,
                term: opts.term,
                academicYearId: opts.academicSessionId,
            },
            select: { studentId: true, total: true },
        });
        const totals = new Map();
        for (const r of armResults)
            totals.set(r.studentId, (totals.get(r.studentId) || 0) + r.total);
        const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
        studentCount = String(ranked.length);
        const idx = ranked.findIndex(([sid]) => sid === opts.studentId);
        if (idx >= 0)
            position = ordinal(idx + 1);
    }
    // Attendance for the term (dates in this session).
    let present = 0, absent = 0;
    if (session) {
        const termName = opts.term;
        const start = session.createdAt;
        const attendance = await prisma_1.default.attendance.findMany({
            where: { studentId: opts.studentId, date: { gte: start } },
            select: { present: true, date: true },
        });
        for (const a of attendance)
            a.present ? present++ : absent++;
        void termName;
    }
    const overall = average > 0 ? await gradeFor(average, student.classId) : "—";
    const termInfo = await prisma_1.default.term.findFirst({
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
            photoUrl: esc(student.user?.photoUrl || ""),
            gender: esc(student.gender),
            className: esc(student.class?.name || ""),
            armName: esc(student.arm?.letter || ""),
        },
        session: { year: esc(session?.name || "") },
        term: { name: esc(termInfo?.name || opts.term), nextTermBegins: "" },
        attendance: {
            present,
            absent,
            total: present + absent,
            percentage: present + absent > 0
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
function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function gradeRemark(total) {
    if (total >= 75)
        return "Excellent";
    if (total >= 65)
        return "Very Good";
    if (total >= 50)
        return "Good";
    if (total >= 45)
        return "Fair";
    return "Needs improvement";
}
/** Grade letter via the school's grading scales (same logic as resultService.computeGrade). */
async function gradeFor(score, classId) {
    let scales;
    if (classId) {
        const cls = await prisma_1.default.class.findUnique({
            where: { id: classId },
            select: { gradingScaleGroupId: true },
        });
        if (cls?.gradingScaleGroupId) {
            scales = await prisma_1.default.gradingScale.findMany({
                where: { groupId: cls.gradingScaleGroupId },
                orderBy: { minScore: "desc" },
            });
        }
    }
    if (!scales)
        scales = await prisma_1.default.gradingScale.findMany({
            where: { groupId: null },
            orderBy: { minScore: "desc" },
        });
    for (const s of scales) {
        if (score >= s.minScore && score <= s.maxScore)
            return s.grade;
    }
    return "—";
}
// ------------------------------ Data binding ------------------------------
/** Fill simple {{placeholders}} (everything except the dynamic rows token). */
function bindSimple(html, data) {
    return html.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const k = key.trim();
        if (k === "results.rows")
            return match; // handled by bindRows
        const parts = k.split(".");
        let cur = data;
        for (const p of parts)
            cur = cur?.[p];
        return cur === undefined || cur === null ? "" : String(cur);
    });
}
/**
 * Clone the prototype <tr> inside <tbody data-dynamic-rows="results.rows">
 * once per subject, binding row.* placeholders.
 */
function bindRows(html, data) {
    const tbodyRe = /<tbody[^>]*data-dynamic-rows=["']?results\.rows["']?[^>]*>([\s\S]*?)<\/tbody>/gi;
    return html.replace(tbodyRe, (_m, inner) => {
        const trMatch = inner.match(/<tr[\s\S]*?<\/tr>/i);
        const prototype = trMatch ? trMatch[0] : "";
        const cloned = data.results.rows
            .map((row) => prototype
            .replace(/\{\{\s*row\.(\w+)\s*\}\}/g, (_mm, field) => String(row[field] ?? ""))
            .replace(/\{\{results\.rows\}\}/g, ""))
            .join("");
        return `<tbody>${cloned || inner.replace(/\{\{[^}]+\}\}/g, "")}</tbody>`;
    });
}
/** Produce the final, self-contained HTML document for preview or PDF. */
function renderTemplateHtml(template, data) {
    const safeHtml = (0, reportTemplateService_1.sanitizeTemplateHtml)(template.htmlTemplate || "");
    const safeCss = (0, reportTemplateService_1.sanitizeTemplateCss)(template.cssTemplate || "");
    const bound = bindRows(bindSimple(safeHtml, data), data);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; }
    img { object-fit: contain; }
    ${safeCss}
  </style></head><body>${bound}</body></html>`;
}
/** Render bound HTML to PDF with Puppeteer using the template's page config. */
async function renderPdf(boundHtml, pageConfig) {
    // Puppeteer v23+ is ESM-only; this module compiles to CommonJS, so use a
    // true dynamic import() instead of a top-level require.
    const puppeteer = (await Promise.resolve().then(() => __importStar(require("puppeteer")))).default ?? (await Promise.resolve().then(() => __importStar(require("puppeteer"))));
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
            waitUntil: "networkidle0",
            timeout: 60000,
        });
        const margin = pageConfig.marginMm || {
            top: 8,
            right: 8,
            bottom: 8,
            left: 8,
        };
        const pdf = await page.pdf({
            format: pageConfig.size || "A4",
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
    }
    finally {
        await browser.close();
    }
}
/** Full pipeline: data → bound HTML → PDF saved under uploads/report-cards. */
async function generateReportCardPdf(opts) {
    const data = await buildTemplateData({
        studentId: opts.studentId,
        academicSessionId: opts.academicSessionId,
        term: opts.term,
    });
    const boundHtml = renderTemplateHtml(opts.template, data);
    let pageConfig = {};
    try {
        pageConfig = JSON.parse(opts.template.pageConfigurations || "{}");
    }
    catch {
        /* default */
    }
    const buffer = await renderPdf(boundHtml, pageConfig);
    // Store the rendered PDF in Cloudinary (Render's disk is ephemeral).
    const stored = await (0, cloudinaryStorage_1.uploadBuffer)(Buffer.from(buffer), {
        folder: "report-cards",
        resourceType: "raw",
    });
    return {
        fileUrl: stored.url,
        data,
        boundHtml,
    };
}
