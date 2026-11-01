"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSpreadsheet = parseSpreadsheet;
exports.extractFromImage = extractFromImage;
exports.validateAgainstSchool = validateAgainstSchool;
exports.ensureClassesForBatch = ensureClassesForBatch;
exports.listMissingClasses = listMissingClasses;
exports.normalizeClassName = normalizeClassName;
exports.registerApprovedStudents = registerApprovedStudents;
// MODULE 9 — AI-powered student onboarding for the Super Admin center.
// Supports:
//  - CSV / XLSX: parsed directly (no AI call) via the existing `xlsx` package.
//  - Images (JPG/PNG/WEBP): sent to Gemini vision for extraction.
// Extraction is validated against the school's existing classes and students
// (duplicate detection) before review. Registration reuses the school's own
// student-creation logic via runWithTenant(schoolId).
const prisma_1 = require("../config/prisma");
const XLSX = __importStar(require("xlsx"));
const aiUsageService_1 = require("./aiUsageService");
const tenantContext_1 = require("../utils/tenantContext");
const studentService_1 = require("./studentService");
const platformAuditService_1 = require("./platformAuditService");
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || "gemini-3.5-flash",
    "gemini-flash-latest",
];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const ONBOARDING_PROMPT = `You are an expert OCR assistant for school student records.
The image is a photo/scan of a student register, admission form or student list (possibly handwritten).
Read EVERY student row and extract their details.

Rules:
- Recognize handwriting carefully; do not invent students not on the document.
- If a field is blank or unreadable use null.
- religion: "CHRISTIANITY"|"ISLAM"|"TRADITIONAL"|other religion if present, else null.
- Set confidence "high" when the print/handwriting is clear, "medium" when slightly unclear, "low" when guessing.

Respond with ONLY valid JSON (no markdown):
{"students":[{"name":string,"gender":"MALE"|"FEMALE"|null,"religion":"CHRISTIANITY"|"ISLAM"|"TRADITIONAL"|string|null,"className":string|null,"admissionNumber":string|null,"dateOfBirth":string|null,"parentName":string|null,"parentPhone":string|null,"parentEmail":string|null,"confidence":"high"|"medium"|"low"}]}`;
/** Parse a spreadsheet (CSV/XLSX) directly — no AI call. */
function parseSpreadsheet(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
    });
    if (!rows.length)
        return [];
    const normalize = (s) => String(s)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const header = rows[0].map(normalize);
    const findCol = (...names) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const nameIdx = findCol("name", "studentname", "fullname");
    if (nameIdx < 0)
        return [];
    const genderIdx = findCol("gender", "sex");
    const religionIdx = findCol("religion");
    const classIdx = findCol("class", "classname");
    const admIdx = findCol("admission", "admno", "regno");
    const dobIdx = findCol("dob", "dateofbirth", "birthday");
    const pNameIdx = findCol("parentname", "guardianname");
    const pPhoneIdx = findCol("parentphone", "guardianphone", "phone");
    const pEmailIdx = findCol("parentemail", "guardianemail", "email");
    const out = [];
    for (const row of rows.slice(1)) {
        const name = String(row[nameIdx] || "").trim();
        if (!name || /^name$/i.test(name))
            continue;
        const genderRaw = genderIdx >= 0 ? String(row[genderIdx]).trim() : "";
        out.push({
            name,
            gender: /m(ale)?/i.test(genderRaw)
                ? "MALE"
                : /f(emale)?/i.test(genderRaw)
                    ? "FEMALE"
                    : null,
            className: classIdx >= 0 ? String(row[classIdx]).trim() || null : null,
            religion: religionIdx >= 0 ? String(row[religionIdx]).trim() || null : null,
            admissionNumber: admIdx >= 0 ? String(row[admIdx]).trim() || null : null,
            dateOfBirth: dobIdx >= 0 ? String(row[dobIdx]).trim() || null : null,
            parentName: pNameIdx >= 0 ? String(row[pNameIdx]).trim() || null : null,
            parentPhone: pPhoneIdx >= 0 ? String(row[pPhoneIdx]).trim() || null : null,
            parentEmail: pEmailIdx >= 0 ? String(row[pEmailIdx]).trim() || null : null,
            confidence: "high",
        });
    }
    return out;
}
/** Extract students from an image via Gemini vision. */
async function extractFromImage(buffer, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw Object.assign(new Error("AI service is not configured (GEMINI_API_KEY)."), { status: 503 });
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: ONBOARDING_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: buffer.toString("base64"),
                        },
                    },
                ],
            },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    let lastErr = null;
    for (const model of GEMINI_MODELS) {
        const resp = await fetch(`${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            lastErr = Object.assign(new Error(`AI extraction failed (status ${resp.status}).`), { status: 502 });
            continue;
        }
        const data = await resp.json();
        const usage = data?.usageMetadata;
        const text = data?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("") || "";
        if (!text)
            throw Object.assign(new Error("AI returned no readable content."), {
                status: 422,
            });
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (!m)
                throw Object.assign(new Error("AI response was not valid JSON."), {
                    status: 422,
                });
            parsed = JSON.parse(m[0]);
        }
        const costUsd = (0, aiUsageService_1.estimateCostUsd)(model, usage?.promptTokenCount || 0, usage?.candidatesTokenCount || 0);
        return {
            students: (Array.isArray(parsed?.students) ? parsed.students : [])
                .filter((s) => s && typeof s.name === "string" && s.name.trim())
                .map((s) => ({
                name: String(s.name).trim(),
                gender: s.gender === "MALE" || s.gender === "FEMALE" ? s.gender : null,
                religion: s.religion ? String(s.religion).trim() : null,
                className: s.className ? String(s.className).trim() : null,
                admissionNumber: s.admissionNumber
                    ? String(s.admissionNumber).trim()
                    : null,
                dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).trim() : null,
                parentName: s.parentName ? String(s.parentName).trim() : null,
                parentPhone: s.parentPhone ? String(s.parentPhone).trim() : null,
                parentEmail: s.parentEmail ? String(s.parentEmail).trim() : null,
                confidence: ["high", "medium", "low"].includes(s.confidence)
                    ? s.confidence
                    : "medium",
            })),
            costUsd,
            model,
            inputTokens: usage?.promptTokenCount || 0,
            outputTokens: usage?.candidatesTokenCount || 0,
        };
    }
    throw (lastErr ||
        Object.assign(new Error("AI extraction failed."), { status: 502 }));
}
/** Validate extracted students against the school's existing data. */
async function validateAgainstSchool(schoolId, students) {
    const [classes, existingStudents] = await Promise.all([
        prisma_1.prisma.class.findMany({ where: { schoolId }, select: { name: true } }),
        prisma_1.prisma.student.findMany({
            where: { schoolId },
            select: { name: true, admissionNumber: true },
        }),
    ]);
    const classNames = classes.map((c) => c.name.toLowerCase());
    const existingNames = new Set(existingStudents.map((s) => s.name.toLowerCase()));
    const existingAdms = new Set(existingStudents.map((s) => s.admissionNumber).filter(Boolean));
    return students.map((s) => {
        const flags = [];
        if (!s.name)
            flags.push("INVALID");
        if (!s.gender)
            flags.push("MISSING_FIELDS");
        if (s.className && !classNames.includes(s.className.toLowerCase()))
            flags.push("CLASS_NOT_FOUND");
        if (s.admissionNumber && existingAdms.has(s.admissionNumber)) {
            flags.push("DUPLICATE");
        }
        else if (existingNames.has(s.name.toLowerCase())) {
            flags.push("DUPLICATE");
        }
        if (s.confidence === "low")
            flags.push("LOW_CONFIDENCE");
        return { ...s, flags };
    });
}
/**
 * Create any classes referenced by a batch's approved records that don't exist
 * in the school yet. Every created class also gets an "Arm A" arm, so students
 * can be placed into a class+arm immediately (the school portal's rosters are
 * arm-based). Returns what was created so the UI can confirm it.
 */
async function ensureClassesForBatch(schoolId, batchId, admin) {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: batchId },
        include: { records: { select: { className: true, status: true } } },
    });
    if (!batch || batch.schoolId !== schoolId)
        throw Object.assign(new Error("Batch not found"), { status: 404 });
    // Distinct non-empty class names from usable records (not rejected/dupes)
    const wanted = [
        ...new Set(batch.records
            .filter((r) => r.status !== "REJECTED" && r.status !== "DUPLICATE")
            .map((r) => r.className?.trim())
            .filter((c) => !!c)),
    ];
    const existing = await prisma_1.prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true },
    });
    const existingByKey = new Map(existing.map((c) => [normalizeClassName(c.name), c]));
    const createdClasses = [];
    const createdArms = [];
    for (const name of wanted) {
        const key = normalizeClassName(name);
        if (existingByKey.has(key))
            continue;
        const cls = await prisma_1.prisma.class.create({
            data: { schoolId, name },
        });
        existingByKey.set(key, { id: cls.id, name });
        createdClasses.push(name);
        // Every new class gets an "Arm A" so students have a placement target.
        const arm = await prisma_1.prisma.arm.create({
            data: { schoolId, letter: "A", classId: cls.id },
        });
        createdArms.push(`${name} — Arm A`);
    }
    if (createdClasses.length) {
        await (0, platformAuditService_1.logPlatformActivity)({
            actorId: admin.id,
            actorName: admin.name,
            action: "ONBOARDING_CLASSES_CREATE",
            targetType: "OnboardingBatch",
            targetId: batchId,
            description: `Created ${createdClasses.length} class(es) from onboarding batch: ${createdClasses.join(", ")}`,
        });
    }
    return { createdClasses, createdArms };
}
/**
 * Class names referenced by a batch's usable records that don't exist in the
 * school yet (fuzzy-compared via normalizeClassName). Used to prompt the
 * Super Admin for confirmation before creating class + "Arm A".
 */
async function listMissingClasses(schoolId, batchId) {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: batchId },
        include: { records: { select: { className: true, status: true } } },
    });
    if (!batch || batch.schoolId !== schoolId)
        throw Object.assign(new Error("Batch not found"), { status: 404 });
    const wanted = [
        ...new Set(batch.records
            .filter((r) => r.status !== "REJECTED" && r.status !== "DUPLICATE")
            .map((r) => r.className?.trim())
            .filter((c) => !!c)),
    ];
    const existing = await prisma_1.prisma.class.findMany({
        where: { schoolId },
        select: { name: true },
    });
    const existingKeys = new Set(existing.map((c) => normalizeClassName(c.name)));
    return wanted.filter((name) => !existingKeys.has(normalizeClassName(name)));
}
/**
 * Class name normalizer used for fuzzy matching ("JSS1" ≈ "JSS 1",
 * "Primary 4." ≈ "Primary 4"). Also fixes digit gaps and common aliases.
 */
function normalizeClassName(name) {
    let n = name.toLowerCase().trim();
    n = n.replace(/\u00a0/g, " "); // nbsp
    n = n.replace(/[.\-_]/g, " ");
    n = n.replace(/jss ?(\d)/g, "jss $1");
    n = n.replace(/ss ?(\d)/g, "ss $1");
    n = n.replace(/primary ?(\d)/g, "primary $1");
    n = n.replace(/grade ?(\d)/g, "primary $1");
    n = n.replace(/\s+/g, " ");
    // Common aliases
    if (/^js\s?\d$/.test(n))
        n = n.replace("js ", "jss ");
    if (/^sss\s?\d$/.test(n))
        n = n.replace("sss ", "ss ");
    return n.trim();
}
/** Find the id of a class by fuzzy class-name match. */
function findClassId(classes, className) {
    const key = normalizeClassName(className);
    const hit = classes.find((c) => normalizeClassName(c.name) === key);
    return hit?.id || null;
}
/** Bulk-register approved students into the school (Module 9 Step 6). */
async function registerApprovedStudents(schoolId, batchId, admin) {
    const batch = await prisma_1.prisma.onboardingBatch.findUnique({
        where: { id: batchId },
        include: { records: true },
    });
    if (!batch || batch.schoolId !== schoolId)
        throw Object.assign(new Error("Batch not found"), { status: 404 });
    // A COMPLETED batch may be re-run as long as it still has un-registered
    // records (e.g. the admin registered one student, reviewed the rest and
    // approved them afterwards). Only refuse when there is nothing left to do.
    const hasUnprocessed = batch.records.some((r) => r.status === "PENDING" || r.status === "APPROVED");
    if (!hasUnprocessed)
        throw Object.assign(new Error("No unprocessed records left in this batch — all students are already registered, duplicates or rejected."), { status: 400 });
    const approved = batch.records.filter((r) => r.status === "APPROVED");
    // Map class names to class IDs once, and each class to its "Arm A" arm
    // (created on demand by ensureClassesForBatch) so students land in a
    // class + arm and show up on the school portal's arm rosters.
    const classes = await prisma_1.prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true },
    });
    const classMap = new Map(classes.map((c) => [normalizeClassName(c.name), c.id]));
    const armMap = new Map();
    for (const cls of classes) {
        const arm = await prisma_1.prisma.arm.findFirst({
            where: { classId: cls.id, letter: "A" },
            select: { id: true },
        });
        if (arm)
            armMap.set(cls.id, arm.id);
    }
    let registered = 0, duplicates = 0, failed = 0;
    for (const rec of approved) {
        try {
            const classId = rec.className
                ? classMap.get(normalizeClassName(rec.className)) || null
                : null;
            const armId = classId ? armMap.get(classId) || null : null;
            // Duplicate guard: same admission number or same name in this school
            const dup = await (0, tenantContext_1.runWithTenant)(schoolId, () => prisma_1.prisma.student.findFirst({
                where: {
                    schoolId,
                    OR: [
                        ...(rec.admissionNumber
                            ? [{ admissionNumber: rec.admissionNumber }]
                            : []),
                        { name: rec.name },
                    ],
                },
            }));
            if (dup) {
                await prisma_1.prisma.onboardingRecord.update({
                    where: { id: rec.id },
                    data: {
                        status: "DUPLICATE",
                        duplicateOfId: dup.id,
                        flags: { push: "DUPLICATE" },
                    },
                });
                duplicates++;
                continue;
            }
            // Reuse the school's own student-creation service (creates user + student
            // in the school's tenant context).
            await (0, tenantContext_1.runWithTenant)(schoolId, () => studentService_1.studentService.create({
                name: rec.name,
                gender: rec.gender || undefined,
                religion: rec.religion || undefined,
                admissionNumber: rec.admissionNumber || undefined,
                classId: classId || undefined,
                armId: armId || undefined,
            }));
            await prisma_1.prisma.onboardingRecord.update({
                where: { id: rec.id },
                data: { status: "REGISTERED" },
            });
            registered++;
        }
        catch (e) {
            console.error("onboarding register failed:", e.message);
            await prisma_1.prisma.onboardingRecord.update({
                where: { id: rec.id },
                data: { status: "REJECTED", flags: { push: "REGISTER_FAILED" } },
            });
            failed++;
        }
    }
    const total = batch.records.length;
    const rejected = batch.records.filter((r) => r.status === "REJECTED" || r.status === "DUPLICATE").length;
    const updated = await prisma_1.prisma.onboardingBatch.update({
        where: { id: batchId },
        data: { status: "COMPLETED", registered, duplicates, rejected },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: admin.id,
        actorName: admin.name,
        action: "ONBOARDING_REGISTER",
        targetType: "OnboardingBatch",
        targetId: batchId,
        description: `Registered ${registered} students into school ${schoolId} (batch ${batchId})`,
        metadata: { registered, duplicates, failed, total },
    });
    return { registered, duplicates, failed, total, batch: updated };
}
