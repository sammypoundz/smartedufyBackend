"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkResultSchema = exports.updateResultSchema = exports.createResultSchema = void 0;
const zod_1 = require("zod");
// Base schema for creating a single result (supports both old and new formats)
exports.createResultSchema = zod_1.z.object({
    studentId: zod_1.z.string(),
    subjectId: zod_1.z.string(),
    armId: zod_1.z.string().optional(), // required for new format
    term: zod_1.z.string(),
    // New fields (ca + exam)
    ca: zod_1.z.number().min(0).max(100).optional(),
    exam: zod_1.z.number().min(0).max(100).optional(),
    // Old field (score) – still accepted
    score: zod_1.z.number().min(0).max(100).optional(),
    grade: zod_1.z.string().optional(),
    academicYearId: zod_1.z.string().optional(), // ✅ NEW – link to academic year
}).refine(data => {
    // Validate that either (ca and exam) are provided OR score is provided
    const hasCaExam = data.ca !== undefined && data.exam !== undefined;
    const hasScore = data.score !== undefined;
    return hasCaExam || hasScore;
}, {
    message: "Either provide both 'ca' and 'exam', or provide 'score'",
});
// Schema for updating a result (partial)
exports.updateResultSchema = zod_1.z.object({
    ca: zod_1.z.number().min(0).max(100).optional(),
    exam: zod_1.z.number().min(0).max(100).optional(),
    total: zod_1.z.number().min(0).max(100).optional(),
    score: zod_1.z.number().min(0).max(100).optional(),
    grade: zod_1.z.string().optional(),
    academicYearId: zod_1.z.string().optional(), // ✅ NEW
});
// Schema for bulk upsert (used by result compiler) – requires new fields
exports.bulkResultSchema = zod_1.z.object({
    results: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string(),
        subjectId: zod_1.z.string(),
        armId: zod_1.z.string(),
        term: zod_1.z.string(),
        ca: zod_1.z.number().min(0).max(100),
        exam: zod_1.z.number().min(0).max(100),
        total: zod_1.z.number().min(0).max(100), // ca + exam
        grade: zod_1.z.string().optional(),
        academicYearId: zod_1.z.string().optional(), // ✅ NEW
    })),
});
