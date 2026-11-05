"use strict";
// AI Report Designer — Gemini vision service.
//
// Two operations, both built on the existing Gemini REST integration pattern
// (same API base / key / model fallback chain as aiService.ts):
//
//   analyseAndGenerate  — page image(s) in → design analysis + HTML/CSS
//                         template with SmartEdufy data placeholders out.
//   correctTemplate     — original page image(s) + current HTML/CSS + school's
//                         correction note in → updated HTML/CSS out (same
//                         design, targeted edits).
//
// The model returns a strict JSON envelope: { analysis, html, css,
// fieldMappings, tableConfigurations, pageConfigurations }.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_PLACEHOLDERS = void 0;
exports.analyseAndGenerate = analyseAndGenerate;
exports.correctTemplate = correctTemplate;
exports.regenerateTemplate = regenerateTemplate;
const aiUsageService_1 = require("./aiUsageService");
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || "gemini-3.5-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// ============================ Placeholder schema ============================
// The ONLY placeholders AI may emit. Everything is bound from SmartEdufy's
// existing academic data in reportTemplateService.buildTemplateData — the
// renderer never queries the DB for arbitrary fields.
exports.SUPPORTED_PLACEHOLDERS = [
    // school
    "school.name", "school.logoUrl", "school.address", "school.phone", "school.email",
    // student
    "student.name", "student.admissionNumber", "student.photoUrl", "student.gender",
    "student.className", "student.armName",
    // session
    "session.year", "term.name", "term.nextTermBegins",
    // attendance
    "attendance.present", "attendance.absent", "attendance.total", "attendance.percentage",
    // academics
    "results.rows", "results.subjectCount", "results.totalScore", "results.average",
    "results.overallGrade", "results.position", "results.studentCount",
    // remarks
    "remarks.teacher", "remarks.principal",
    // signatures
    "signatures.teacher", "signatures.principal", "signatures.stamp",
    // meta
    "generated.date",
];
const SYSTEM_RULES = `
You are the SmartEdufy Report Designer AI. You recreate school report cards as
print-ready HTML/CSS templates with dynamic data placeholders.

OUTPUT CONTRACT (STRICT):
Respond with ONLY valid JSON (no markdown fences, no commentary) shaped as:
{
  "analysis": {"documentLayout": string, "orientation": "portrait"|"landscape", "pages": number, "sections": string[], "notes": string},
  "html": string,
  "css": string,
  "fieldMappings": {object: placeholder -> human description},
  "tableConfigurations": {"columns": string[], "dynamicRows": boolean, "rowPlaceholder": string},
  "pageConfigurations": {"size": string, "orientation": "portrait"|"landscape", "marginMm": {"top":num,"right":num,"bottom":num,"left":num}, "pageBreaks": string}
}

PLACEHOLDERS (use these EXACT tokens, double-brace style):
{{school.name}} {{school.logoUrl}} {{school.address}} {{school.phone}} {{school.email}}
{{student.name}} {{student.admissionNumber}} {{student.photoUrl}} {{student.gender}} {{student.className}} {{student.armName}}
{{session.year}} {{term.name}} {{term.nextTermBegins}}
{{attendance.present}} {{attendance.absent}} {{attendance.total}} {{attendance.percentage}}
{{results.rows}} {{results.subjectCount}} {{results.totalScore}} {{results.average}} {{results.overallGrade}} {{results.position}} {{results.studentCount}}
{{remarks.teacher}} {{remarks.principal}} {{signatures.teacher}} {{signatures.principal}} {{signatures.stamp}} {{generated.date}}

RENDERING RULES:
1. The subject/result table is ONE <tbody> wrapped in a marker element:
   <tbody data-dynamic-rows="results.rows"> ... ONE prototype <tr> ... </tbody>
   The prototype row may use {{row.subject}}, {{row.ca}}, {{row.exam}}, {{row.total}}, {{row.grade}}, {{row.remark}}.
   The engine clones that row per subject — NEVER hardcode a fixed number of rows.
2. Do NOT include <html>, <head>, <body>, <script>, <link>, <iframe> or any event handler attributes (onclick etc.). Produce a fragment.
3. CSS goes ONLY in the "css" field (plain CSS, no @import, no url() to external hosts, no @font-face pointing to remote files). Use safe system font stacks.
4. Images: {{school.logoUrl}} and {{student.photoUrl}} render as <img src="...">. Keep fixed dimensions with object-fit: contain so photos never distort.
5. Long names/remarks must wrap: use word-wrap/overflow-wrap on text containers. Tables must not overflow the page width.
6. Multi-page designs: repeat the section on every page as separate .page divs with CSS 'page-break-after: always'. Respect the original document's page count.
7. Reproduce the uploaded design faithfully: same layout, borders, colours, fonts, alignment, section order and wording of headings. Match the visual, not just the text.
8. Every visible data element in the original should use a placeholder — no lorem ipsum, no sample names baked in.
9. If part of the original document is a school-specific static text (motto, address lines, letterhead text), keep it as plain static text in the HTML.
`.trim();
const ANALYSIS_PROMPT = `${SYSTEM_RULES}

TASK: The attached page image(s) are a school's existing report card design.
Recreate the ENTIRE design as an HTML/CSS template using the placeholder
contract above. Analyse every visual element first (layout, logo position,
headings, tables, columns, order, colours, borders, signatures, stamps,
attendance blocks, remarks boxes), then produce the template.`;
const CORRECTION_PROMPT = `${SYSTEM_RULES}

TASK: You previously generated an HTML/CSS recreation of this school's report
card (attached: the original design page(s) AND the current generated HTML/CSS).
The school requested corrections. Apply ONLY the requested corrections while
keeping everything else identical. Return the FULL updated template in the same
JSON contract (complete html and css, not a diff).`;
async function callGemini(prompt, pages, opts) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw Object.assign(new Error("AI service is not configured. Set GEMINI_API_KEY."), { status: 503 });
    }
    const extraText = [
        opts.html ? `CURRENT HTML:\n\`\`\`\n${opts.html}\n\`\`\`` : "",
        opts.css ? `CURRENT CSS:\n\`\`\`\n${opts.css}\n\`\`\`` : "",
    ].filter(Boolean).join("\n\n");
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: extraText ? `${prompt}\n\n${extraText}` : prompt },
                    ...pages.slice(0, 6).map((p) => ({
                        inline_data: { mime_type: p.mimeType, data: p.base64 },
                    })),
                ],
            },
        ],
        generationConfig: {
            temperature: opts.temperature ?? 0.2,
            responseMimeType: "application/json",
            maxOutputTokens: opts.maxOutputTokens ?? 16384,
        },
    };
    const started = Date.now();
    let lastErr = null;
    for (const model of GEMINI_MODELS) {
        // Transient Google-side errors (429 rate-limit, 500/503 overloaded)
        // are retried with a short backoff before falling through to the
        // next model.
        const RETRYABLE = new Set([429, 500, 503]);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resp = await fetch(`${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (!resp.ok) {
                    const detail = await resp.text().catch(() => "");
                    console.error(`Gemini API error (${model}):`, resp.status, detail.slice(0, 400));
                    lastErr = Object.assign(new Error(resp.status === 503
                        ? "AI model is temporarily overloaded. Please retry in a moment."
                        : `AI request failed (status ${resp.status}).`), { status: resp.status === 503 ? 503 : 502 });
                    if (RETRYABLE.has(resp.status) && attempt < 2) {
                        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                        continue;
                    }
                    break; // move to the next model
                }
                const data = await resp.json();
                const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
                if (!text) {
                    lastErr = Object.assign(new Error("AI returned no readable content."), { status: 422 });
                    continue;
                }
                // usage / cost logging through the existing tracking system
                const usage = data?.usageMetadata || {};
                (0, aiUsageService_1.logAiUsage)({
                    schoolId: opts.schoolId,
                    userId: opts.userId,
                    operation: opts.operation,
                    provider: "gemini",
                    model,
                    status: "SUCCESS",
                    requests: 1,
                    inputTokens: usage.promptTokenCount,
                    outputTokens: usage.candidatesTokenCount,
                    costUsd: (0, aiUsageService_1.estimateCostUsd)(model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0),
                    processingMs: Date.now() - started,
                }).catch(() => { });
                return text;
            }
            catch (err) {
                lastErr = err;
                break;
            }
        }
    }
    (0, aiUsageService_1.logAiUsage)({
        schoolId: opts.schoolId,
        userId: opts.userId,
        operation: opts.operation,
        provider: "gemini",
        model: GEMINI_MODELS[0],
        status: "FAILED",
        errorMessage: lastErr?.message,
        processingMs: Date.now() - started,
    }).catch(() => { });
    throw lastErr || Object.assign(new Error("AI generation failed. Please try again."), { status: 502 });
}
function parseEnvelope(raw) {
    let text = raw.trim();
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match)
            throw Object.assign(new Error("AI response was not valid JSON."), { status: 422 });
        parsed = JSON.parse(match[0]);
    }
    if (!parsed?.html || typeof parsed.html !== "string" || !parsed.css) {
        throw Object.assign(new Error("AI response missing html/css payload."), { status: 422 });
    }
    // Placeholder validation: any {{...}} token must be known or a row.* token.
    const used = new Set((parsed.html.match(/\{\{([^}]+)\}\}/g) || []).map((t) => t.slice(2, -2).trim()));
    const unknown = [...used].filter((t) => !exports.SUPPORTED_PLACEHOLDERS.includes(t) && !t.startsWith("row."));
    if (unknown.length > 0) {
        // Remove unknown tokens rather than failing the whole generation — replace
        // with empty string so the template still renders.
        for (const tok of unknown) {
            parsed.html = parsed.html.split(`{{${tok}}}`).join("");
        }
    }
    const tableConfig = parsed.tableConfigurations && typeof parsed.tableConfigurations === "object"
        ? {
            columns: Array.isArray(parsed.tableConfigurations.columns) ? parsed.tableConfigurations.columns.map(String) : [],
            dynamicRows: parsed.tableConfigurations.dynamicRows !== false,
            rowPlaceholder: parsed.tableConfigurations.rowPlaceholder || "results.rows",
        }
        : { columns: [], dynamicRows: true, rowPlaceholder: "results.rows" };
    const pageConfig = parsed.pageConfigurations && typeof parsed.pageConfigurations === "object"
        ? {
            size: parsed.pageConfigurations.size || "A4",
            orientation: parsed.pageConfigurations.orientation === "landscape" ? "landscape" : "portrait",
            marginMm: {
                top: numOr(parsed.pageConfigurations.marginMm?.top, 8),
                right: numOr(parsed.pageConfigurations.marginMm?.right, 8),
                bottom: numOr(parsed.pageConfigurations.marginMm?.bottom, 8),
                left: numOr(parsed.pageConfigurations.marginMm?.left, 8),
            },
            pageBreaks: parsed.pageConfigurations.pageBreaks || "",
        }
        : { size: "A4", orientation: "portrait", marginMm: { top: 8, right: 8, bottom: 8, left: 8 }, pageBreaks: "" };
    return {
        analysis: {
            documentLayout: String(parsed.analysis?.documentLayout || ""),
            orientation: (pageConfig.orientation === "landscape" ? "landscape" : "portrait"),
            pages: Number(parsed.analysis?.pages) || pagesCountFromPages,
            sections: Array.isArray(parsed.analysis?.sections) ? parsed.analysis.sections.map(String) : [],
            notes: parsed.analysis?.notes ? String(parsed.analysis.notes) : undefined,
        },
        html: parsed.html,
        css: parsed.css,
        fieldMappings: parsed.fieldMappings && typeof parsed.fieldMappings === "object" ? parsed.fieldMappings : {},
        tableConfigurations: tableConfig,
        pageConfigurations: pageConfig,
    };
}
let pagesCountFromPages = 1;
function numOr(v, d) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 60 ? n : d;
}
/** Step 2+3 in one call: analyse design and generate the HTML/CSS template. */
async function analyseAndGenerate(pages, meta) {
    pagesCountFromPages = pages.length;
    const raw = await callGemini(ANALYSIS_PROMPT, pages, {
        schoolId: meta.schoolId,
        userId: meta.userId,
        operation: "REPORT_TEMPLATE_GENERATE",
        temperature: 0.2,
    });
    const modelUsed = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    return { template: parseEnvelope(raw), model: modelUsed };
}
/** Step 4 correction pass: update the existing template, keep the design. */
async function correctTemplate(pages, current, instructions, meta) {
    pagesCountFromPages = pages.length;
    const prompt = `${CORRECTION_PROMPT}\n\nCORRECTIONS REQUESTED BY THE SCHOOL:\n"""${instructions.slice(0, 4000)}"""`;
    const raw = await callGemini(prompt, pages, {
        schoolId: meta.schoolId,
        userId: meta.userId,
        operation: "REPORT_TEMPLATE_CORRECT",
        html: current.html,
        css: current.css,
        temperature: 0.15,
    });
    const modelUsed = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    return { template: parseEnvelope(raw), model: modelUsed };
}
/** Regenerate from scratch (different attempt of the same analysis). */
async function regenerateTemplate(pages, meta) {
    pagesCountFromPages = pages.length;
    const raw = await callGemini(`${ANALYSIS_PROMPT}\n\nNOTE: A previous attempt was rejected. Pay extra attention to faithful visual reproduction of every section, border, colour and column of the original.`, pages, {
        schoolId: meta.schoolId,
        userId: meta.userId,
        operation: "REPORT_TEMPLATE_REGENERATE",
        temperature: 0.35,
    });
    const modelUsed = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    return { template: parseEnvelope(raw), model: modelUsed };
}
