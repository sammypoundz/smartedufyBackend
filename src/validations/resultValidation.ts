import { z } from 'zod';

// Base schema for creating a single result (supports both old and new formats)
export const createResultSchema = z.object({
  studentId: z.string(),
  subjectId: z.string(),
  armId: z.string().optional(),        // required for new format
  term: z.string(),
  // New fields (ca + exam)
  ca: z.number().min(0).max(100).optional(),
  exam: z.number().min(0).max(100).optional(),
  // Old field (score) – still accepted
  score: z.number().min(0).max(100).optional(),
  grade: z.string().optional(),
  academicYearId: z.string().optional(), // ✅ NEW – link to academic year
}).refine(data => {
  // Validate that either (ca and exam) are provided OR score is provided
  const hasCaExam = data.ca !== undefined && data.exam !== undefined;
  const hasScore = data.score !== undefined;
  return hasCaExam || hasScore;
}, {
  message: "Either provide both 'ca' and 'exam', or provide 'score'",
});

// Schema for updating a result (partial)
export const updateResultSchema = z.object({
  ca: z.number().min(0).max(100).optional(),
  exam: z.number().min(0).max(100).optional(),
  total: z.number().min(0).max(100).optional(),
  score: z.number().min(0).max(100).optional(),
  grade: z.string().optional(),
  academicYearId: z.string().optional(), // ✅ NEW
});

// Schema for bulk upsert (used by result compiler) – requires new fields
export const bulkResultSchema = z.object({
  results: z.array(z.object({
    studentId: z.string(),
    subjectId: z.string(),
    armId: z.string(),
    term: z.string(),
    ca: z.number().min(0).max(100),
    exam: z.number().min(0).max(100),
    total: z.number().min(0).max(100), // ca + exam
    grade: z.string().optional(),
    academicYearId: z.string().optional(), // ✅ NEW
  })),
});