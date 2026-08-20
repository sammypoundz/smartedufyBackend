"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
// ---------- Private helpers ----------
async function computeGrade(score) {
    const scales = await db_1.default.gradingScale.findMany({ orderBy: { minScore: 'desc' } });
    for (const scale of scales) {
        if (score >= scale.minScore && score <= scale.maxScore) {
            return scale.grade;
        }
    }
    return 'F';
}
async function getOrCreateCbtSubject() {
    const tenantId = (0, tenantContext_1.getCurrentTenantId)();
    if (!tenantId)
        throw new Error('Tenant context missing');
    const cbtSubject = await db_1.default.subject.findFirst({
        where: { name: 'CBT', schoolId: tenantId },
    });
    if (cbtSubject)
        return cbtSubject.id;
    const newSubject = await db_1.default.subject.create({
        data: {
            name: 'CBT',
            description: 'Computer-Based Test results',
            schoolId: tenantId,
        },
    });
    return newSubject.id;
}
exports.resultService = {
    /**
     * Get results for a specific student, optionally filtered by academicYearId and term.
     */
    getByStudentId: (studentId, academicYearId, term) => db_1.default.result.findMany({
        where: {
            studentId,
            ...(academicYearId && { academicYearId }),
            ...(term && { term }),
        },
        include: { subject: true, arm: true },
        orderBy: { term: 'desc' },
    }), // middleware adds schoolId
    /**
     * Get results for all students in an arm, optionally filtered by term and academicYearId.
     */
    getByArmId: (armId, term, academicYearId) => db_1.default.result.findMany({
        where: {
            armId,
            ...(term && { term }),
            ...(academicYearId && { academicYearId }),
        },
        include: { student: true, subject: true },
        orderBy: [{ term: 'desc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId
    /**
     * Get results for a subject across all arms, optionally filtered by term and academicYearId.
     */
    getBySubjectId: (subjectId, term, academicYearId) => db_1.default.result.findMany({
        where: {
            subjectId,
            ...(term && { term }),
            ...(academicYearId && { academicYearId }),
        },
        include: { student: true, subject: true },
        orderBy: [{ term: 'desc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId
    /**
     * Get results by arm, subject, term, and academicYearId (used by the result compiler and reports page).
     */
    getByArmSubjectTerm: async (armId, subjectId, term, academicYearId) => {
        return db_1.default.result.findMany({
            where: {
                armId,
                subjectId,
                term,
                ...(academicYearId && { academicYearId }),
            },
            select: {
                studentId: true,
                subjectId: true,
                ca: true,
                exam: true,
                total: true,
                grade: true,
            },
        }); // middleware adds schoolId
    },
    /**
     * Get results for an arm and term (all subjects) – used by the broadsheet.
     */
    getByArmTerm: async (armId, term, academicYearId) => {
        return db_1.default.result.findMany({
            where: {
                armId,
                term,
                ...(academicYearId && { academicYearId }),
            },
            select: {
                studentId: true,
                subjectId: true,
                total: true,
                grade: true,
            },
        }); // middleware adds schoolId
    },
    /**
     * Get all results for a specific academic year.
     */
    getByAcademicYear: (academicYearId) => db_1.default.result.findMany({
        where: { academicYearId },
        include: { student: true, subject: true, arm: true },
        orderBy: [{ term: 'asc' }, { student: { name: 'asc' } }],
    }), // middleware adds schoolId
    /**
     * Get compilation history for an arm (distinct academic year + term pairs).
     */
    getHistory: async (armId) => {
        const history = await db_1.default.result.findMany({
            where: { armId },
            select: {
                academicYearId: true,
                term: true,
                academicYear: { select: { name: true } },
            },
            distinct: ['academicYearId', 'term'],
            orderBy: [
                { academicYear: { name: 'desc' } },
                { term: 'asc' },
            ],
        }); // middleware adds schoolId
        return history.map(h => ({
            academicYearId: h.academicYearId,
            academicYearName: h.academicYear?.name || 'Unknown',
            term: h.term,
        }));
    },
    /**
     * Create a single result (includes academicYearId if provided).
     */
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.result.create({
            data: {
                ...data,
                score: data.total,
                schoolId: tenantId,
            },
        });
    },
    /**
     * Update an existing result.
     */
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updateData = { ...data };
        if (data.total !== undefined) {
            updateData.score = data.total;
        }
        return db_1.default.result.update({
            where: { id, schoolId: tenantId },
            data: updateData,
        });
    },
    /**
     * Delete a result.
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.result.delete({
            where: { id, schoolId: tenantId },
        });
    },
    /**
     * Bulk upsert results – uses the updated unique constraint (includes academicYearId).
     */
    bulkUpsert: async (results) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const operations = results.map(result => db_1.default.result.upsert({
            where: {
                studentId_subjectId_armId_term_academicYearId: {
                    studentId: result.studentId,
                    subjectId: result.subjectId,
                    armId: result.armId,
                    term: result.term,
                    academicYearId: result.academicYearId,
                },
            },
            update: {
                ca: result.ca,
                exam: result.exam,
                total: result.total,
                grade: result.grade,
                score: result.total,
                academicYearId: result.academicYearId,
            },
            create: {
                ...result,
                score: result.total,
                schoolId: tenantId,
            },
        }));
        return await db_1.default.$transaction(operations);
    },
    /**
     * Push test attempt scores to student results (CA or Exam)
     * Also links the CBT subject to the arm so it appears in the result compiler.
     */
    pushTestAttemptsToResults: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // 1. Get the test to retrieve armId (ensure it belongs to tenant)
        const test = await db_1.default.test.findUnique({
            where: { id: data.testId, schoolId: tenantId },
            select: { armId: true, name: true },
        });
        if (!test)
            throw new Error('Test not found');
        // 2. Get or create a CBT subject (tenant-aware)
        const subjectId = await getOrCreateCbtSubject();
        // Ensure the CBT subject is linked to the arm
        const existingLink = await db_1.default.subjectArm.findFirst({
            where: { armId: test.armId, subjectId, schoolId: tenantId },
        });
        if (!existingLink) {
            await db_1.default.subjectArm.create({
                data: {
                    armId: test.armId,
                    subjectId,
                    teacherId: null,
                    schoolId: tenantId,
                },
            });
            console.log(`✅ CBT subject linked to arm ${test.armId}`);
        }
        // 3. Get all attempts for this test with student details (already tenant-scoped via Test)
        const attempts = await db_1.default.testAttempt.findMany({
            where: { testId: data.testId },
            include: { student: { select: { id: true } } },
        });
        if (attempts.length === 0)
            throw new Error('No attempts found for this test');
        // 4. Prepare result records with computed grades
        const resultsData = await Promise.all(attempts.map(async (attempt) => {
            const score = attempt.score;
            const grade = await computeGrade(score);
            return {
                studentId: attempt.studentId,
                subjectId,
                armId: test.armId,
                term: data.term,
                ca: data.resultType === 'ca' ? score : 0,
                exam: data.resultType === 'exam' ? score : 0,
                total: attempt.total,
                score,
                grade,
                academicYearId: data.academicYearId,
                schoolId: tenantId,
            };
        }));
        // 5. Upsert results in a transaction
        await db_1.default.$transaction(resultsData.map(result => db_1.default.result.upsert({
            where: {
                studentId_subjectId_armId_term_academicYearId: {
                    studentId: result.studentId,
                    subjectId: result.subjectId,
                    armId: result.armId,
                    term: result.term,
                    academicYearId: result.academicYearId,
                },
            },
            update: {
                ca: result.ca,
                exam: result.exam,
                total: result.total,
                score: result.score,
                grade: result.grade,
            },
            create: {
                studentId: result.studentId,
                subjectId: result.subjectId,
                armId: result.armId,
                term: result.term,
                ca: result.ca,
                exam: result.exam,
                total: result.total,
                score: result.score,
                grade: result.grade,
                academicYearId: result.academicYearId,
                schoolId: result.schoolId,
            },
        })));
        return { count: attempts.length };
    },
};
