// MODULE 9 — AI-powered student onboarding for the Super Admin center.
// Supports:
//  - CSV / XLSX: parsed directly (no AI call) via the existing `xlsx` package.
//  - Images (JPG/PNG/WEBP): sent to Gemini vision for extraction.
// Extraction is validated against the school's existing classes and students
// (duplicate detection) before review. Registration reuses the school's own
// student-creation logic via runWithTenant(schoolId).
import { prisma } from "../config/prisma";
import * as XLSX from "xlsx";
import { logAiUsage, estimateCostUsd } from "./aiUsageService";
import { runWithTenant } from "../utils/tenantContext";
import { studentService } from "./studentService";
import { logPlatformActivity } from "./platformAuditService";

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.5-flash",
  "gemini-flash-latest",
];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface ExtractedStudent {
  name: string;
  gender?: string | null;
  religion?: string | null;
  className?: string | null;
  admissionNumber?: string | null;
  dateOfBirth?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  confidence: "high" | "medium" | "low";
}

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
export function parseSpreadsheet(buffer: Buffer): ExtractedStudent[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });
  if (!rows.length) return [];

  const normalize = (s: any) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const header = rows[0].map(normalize);
  const findCol = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const nameIdx = findCol("name", "studentname", "fullname");
  if (nameIdx < 0) return [];
  const genderIdx = findCol("gender", "sex");
  const religionIdx = findCol("religion");
  const classIdx = findCol("class", "classname");
  const admIdx = findCol("admission", "admno", "regno");
  const dobIdx = findCol("dob", "dateofbirth", "birthday");
  const pNameIdx = findCol("parentname", "guardianname");
  const pPhoneIdx = findCol("parentphone", "guardianphone", "phone");
  const pEmailIdx = findCol("parentemail", "guardianemail", "email");

  const out: ExtractedStudent[] = [];
  for (const row of rows.slice(1)) {
    const name = String(row[nameIdx] || "").trim();
    if (!name || /^name$/i.test(name)) continue;
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
      parentPhone:
        pPhoneIdx >= 0 ? String(row[pPhoneIdx]).trim() || null : null,
      parentEmail:
        pEmailIdx >= 0 ? String(row[pEmailIdx]).trim() || null : null,
      confidence: "high",
    });
  }
  return out;
}

/** Extract students from an image via Gemini vision. */
export async function extractFromImage(buffer: Buffer, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw Object.assign(
      new Error("AI service is not configured (GEMINI_API_KEY)."),
      { status: 503 },
    );

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

  let lastErr: any = null;
  for (const model of GEMINI_MODELS) {
    const resp = await fetch(
      `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) {
      lastErr = Object.assign(
        new Error(`AI extraction failed (status ${resp.status}).`),
        { status: 502 },
      );
      continue;
    }
    const data: any = await resp.json();
    const usage = data?.usageMetadata;
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text || "")
        .join("") || "";
    if (!text)
      throw Object.assign(new Error("AI returned no readable content."), {
        status: 422,
      });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m)
        throw Object.assign(new Error("AI response was not valid JSON."), {
          status: 422,
        });
      parsed = JSON.parse(m[0]);
    }

    const costUsd = estimateCostUsd(
      model,
      usage?.promptTokenCount || 0,
      usage?.candidatesTokenCount || 0,
    );
    return {
      students: (Array.isArray(parsed?.students) ? parsed.students : [])
        .filter((s: any) => s && typeof s.name === "string" && s.name.trim())
        .map(
          (s: any): ExtractedStudent => ({
            name: String(s.name).trim(),
            gender:
              s.gender === "MALE" || s.gender === "FEMALE" ? s.gender : null,
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
          }),
        ),
      costUsd,
      model,
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
    };
  }
  throw (
    lastErr ||
    Object.assign(new Error("AI extraction failed."), { status: 502 })
  );
}

/** Validate extracted students against the school's existing data. */
export async function validateAgainstSchool(
  schoolId: string,
  students: ExtractedStudent[],
) {
  const [classes, existingStudents] = await Promise.all([
    prisma.class.findMany({ where: { schoolId }, select: { name: true } }),
    prisma.student.findMany({
      where: { schoolId },
      select: { name: true, admissionNumber: true },
    }),
  ]);
  const classNames = classes.map((c) => c.name.toLowerCase());
  const existingNames = new Set(
    existingStudents.map((s) => s.name.toLowerCase()),
  );
  const existingAdms = new Set(
    existingStudents.map((s) => s.admissionNumber).filter(Boolean) as string[],
  );

  return students.map((s) => {
    const flags: string[] = [];
    if (!s.name) flags.push("INVALID");
    if (!s.gender) flags.push("MISSING_FIELDS");
    if (s.className && !classNames.includes(s.className.toLowerCase()))
      flags.push("CLASS_NOT_FOUND");
    if (s.admissionNumber && existingAdms.has(s.admissionNumber)) {
      flags.push("DUPLICATE");
    } else if (existingNames.has(s.name.toLowerCase())) {
      flags.push("DUPLICATE");
    }
    if (s.confidence === "low") flags.push("LOW_CONFIDENCE");
    return { ...s, flags };
  });
}

/** Bulk-register approved students into the school (Module 9 Step 6). */
export async function registerApprovedStudents(
  schoolId: string,
  batchId: string,
  admin: { id: string; name: string },
) {
  const batch = await prisma.onboardingBatch.findUnique({
    where: { id: batchId },
    include: { records: true },
  });
  if (!batch || batch.schoolId !== schoolId)
    throw Object.assign(new Error("Batch not found"), { status: 404 });
  if (batch.status === "COMPLETED")
    throw Object.assign(new Error("Batch already completed"), { status: 400 });

  const approved = batch.records.filter((r) => r.status === "APPROVED");
  // Map class names to class IDs once
  const classes = await prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true },
  });
  const classMap = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));

  let registered = 0,
    duplicates = 0,
    failed = 0;
  for (const rec of approved) {
    try {
      const classId = rec.className
        ? classMap.get(rec.className.toLowerCase()) || null
        : null;
      // Duplicate guard: same admission number or same name in this school
      const dup = await runWithTenant(schoolId, () =>
        prisma.student.findFirst({
          where: {
            schoolId,
            OR: [
              ...(rec.admissionNumber
                ? [{ admissionNumber: rec.admissionNumber }]
                : []),
              { name: rec.name },
            ],
          },
        }),
      );
      if (dup) {
        await prisma.onboardingRecord.update({
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
      await runWithTenant(schoolId, () =>
        studentService.create({
          name: rec.name,
          gender: rec.gender || undefined,
          religion: rec.religion || undefined,
          admissionNumber: rec.admissionNumber || undefined,
          classId: classId || undefined,
        }),
      );
      await prisma.onboardingRecord.update({
        where: { id: rec.id },
        data: { status: "REGISTERED" },
      });
      registered++;
    } catch (e) {
      console.error("onboarding register failed:", (e as Error).message);
      await prisma.onboardingRecord.update({
        where: { id: rec.id },
        data: { status: "REJECTED", flags: { push: "REGISTER_FAILED" } },
      });
      failed++;
    }
  }

  const total = batch.records.length;
  const rejected = batch.records.filter(
    (r) => r.status === "REJECTED" || r.status === "DUPLICATE",
  ).length;
  const updated = await prisma.onboardingBatch.update({
    where: { id: batchId },
    data: { status: "COMPLETED", registered, duplicates, rejected },
  });

  await logPlatformActivity({
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
