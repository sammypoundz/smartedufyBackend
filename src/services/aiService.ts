// AI vision service — extracts structured data from result-sheet photos.
// Uses the Google Gemini REST API (no SDK needed) with a vision model that
// handles both printed tables and handwritten entries.
//
// Required env: GEMINI_API_KEY (https://aistudio.google.com/apikey)

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.5-flash", // verified working; 3.8+ is often overloaded
  "gemini-3.5-flash",
  "gemini-flash-latest", // stable alias, fallback on 404/503
];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface ExtractedStudentMark {
  name: string;
  admissionNumber?: string | null;
  ca1?: number | null;
  ca2?: number | null;
  ca3?: number | null;
  exam?: number | null;
  total?: number | null;
  confidence: "high" | "medium" | "low";
}

const PROMPT = `You are an expert OCR assistant for school result entry sheets.
The image is a photo or scan of a result/CA entry sheet (possibly handwritten).
Read EVERY student row in the table and extract the marks.

Rules:
- Recognize handwriting: read messy/curvy handwritten digits and names carefully.
- Column names may vary: "1CA", "CA1", "1st CA", "Test 1" -> ca1. Same idea for ca2, ca3. "Exam", "Exam Score", "70" -> exam. "Total" -> total.
- If a cell is blank or unreadable, use null for that field.
- Clamp each mark between 0 and 100.
- If a name is partly unreadable, transcribe your best reading and set confidence to "low".
- Use "high" confidence when the handwriting/print is clear, "medium" when slightly unclear, "low" when guessing.
- Do NOT invent students that are not on the sheet. Return an empty list if none.
- admissionNumber may be present in an "Adm No" / "Reg No" column; null if absent.

Respond with ONLY valid JSON matching exactly this schema (no markdown, no commentary):
{"students":[{"name":string,"admissionNumber":string|null,"ca1":number|null,"ca2":number|null,"ca3":number|null,"exam":number|null,"total":number|null,"confidence":"high"|"medium"|"low"}]}`;

export async function extractResultSheet(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedStudentMark[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "AI service is not configured. Set GEMINI_API_KEY in the backend environment.",
      ),
      { status: 503 },
    );
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
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
    const detail = await resp.text().catch(() => "");
    console.error(`Gemini API error (${model}):`, resp.status, detail.slice(0, 500));
    lastErr = Object.assign(
      new Error(
        `AI extraction failed (status ${resp.status}). Please try again.`,
      ),
      { status: 502 },
    );
    // Retry with the next model on temporary/permanent model errors
    continue;
  }

  const data: any = await resp.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || "")
      .join("") || "";

  if (!text) {
    throw Object.assign(
      new Error("AI returned no readable content for this image."),
      { status: 422 },
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Tolerate models that wrap JSON in ```json fences despite responseMimeType
    const match = text.match(/\{[\s\S]*\}/);
    if (!match)
      throw Object.assign(new Error("AI response was not valid JSON."), {
        status: 422,
      });
    parsed = JSON.parse(match[0]);
  }

  const students: ExtractedStudentMark[] = Array.isArray(parsed?.students)
    ? parsed.students
    : [];
  return students
    .filter((s: any) => s && typeof s.name === "string" && s.name.trim())
    .map((s: any) => ({
      name: String(s.name).trim(),
      admissionNumber: s.admissionNumber
        ? String(s.admissionNumber).trim()
        : null,
      ca1: clampNullable(s.ca1),
      ca2: clampNullable(s.ca2),
      ca3: clampNullable(s.ca3),
      exam: clampNullable(s.exam),
      total: clampNullable(s.total),
      confidence: ["high", "medium", "low"].includes(s.confidence)
        ? s.confidence
        : "medium",
    }));
  }
  // All models failed
  throw lastErr || Object.assign(new Error("AI extraction failed. Please try again."), { status: 502 });
}

function clampNullable(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
