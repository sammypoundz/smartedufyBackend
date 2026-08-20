"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicService = void 0;
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
        where: {
            name: 'CBT',
            schoolId: tenantId, // scope to current tenant
        },
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
// ---------- Service ----------
exports.academicService = {
    // --- Grading scales ---
    getGradingScales: () => db_1.default.gradingScale.findMany({ orderBy: { minScore: 'desc' } }), // middleware adds schoolId
    saveGradingScales: async (scales) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await db_1.default.gradingScale.deleteMany({
            where: { schoolId: tenantId },
        });
        for (const scale of scales) {
            await db_1.default.gradingScale.create({
                data: {
                    grade: scale.grade,
                    minScore: scale.min,
                    maxScore: scale.max,
                    schoolId: tenantId,
                },
            });
        }
        return { count: scales.length };
    },
    // --- Academic Years & Terms ---
    getAllAcademicYears: () => db_1.default.academicYear.findMany({
        include: { terms: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
    }), // middleware adds schoolId
    getCurrentSession: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const activeYear = await db_1.default.academicYear.findFirst({
            where: { isActive: true, schoolId: tenantId },
            include: { terms: true },
        });
        if (!activeYear)
            return { year: null, term: null };
        let activeTerm = null;
        const termSetting = await db_1.default.globalSetting.findUnique({
            where: { key: 'activeTermId' },
        });
        if (termSetting && termSetting.value) {
            activeTerm = activeYear.terms.find((t) => t.id === termSetting.value) || null;
        }
        if (!activeTerm && activeYear.terms.length) {
            activeTerm = activeYear.terms[0];
        }
        return { year: activeYear, term: activeTerm };
    },
    setCurrentSession: async (yearId, termId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Deactivate all other academic years for this tenant
        await db_1.default.academicYear.updateMany({
            where: { schoolId: tenantId },
            data: { isActive: false },
        });
        // Activate the selected year (ensure it belongs to the tenant)
        await db_1.default.academicYear.update({
            where: { id: yearId, schoolId: tenantId },
            data: { isActive: true },
        });
        // Update the global setting (activeTermId) – this is global for now
        // If you want per‑tenant, add schoolId to GlobalSetting later.
        await db_1.default.globalSetting.upsert({
            where: { key: 'activeTermId' },
            update: { value: termId },
            create: { key: 'activeTermId', value: termId },
        });
        return { yearId, termId };
    },
    createAcademicYear: async (name, termNames) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const year = await db_1.default.academicYear.create({
            data: {
                name,
                schoolId: tenantId,
                terms: {
                    create: termNames.map((name, idx) => ({ name, order: idx + 1, schoolId: tenantId })),
                },
            },
            include: { terms: true },
        });
        return year;
    },
    // --- Push test attempt scores to student results (CA or Exam) ---
    pushTestAttemptsToResults: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // 1. Get the test (ensure it belongs to the tenant)
        const test = await db_1.default.test.findUnique({
            where: { id: data.testId, schoolId: tenantId },
            select: { armId: true, name: true },
        });
        if (!test)
            throw new Error('Test not found');
        // 2. Get or create a CBT subject (tenant‑aware)
        const subjectId = await getOrCreateCbtSubject();
        // 3. Get all attempts for this test
        const attempts = await db_1.default.testAttempt.findMany({
            where: { testId: data.testId },
            include: { student: { select: { id: true } } },
        });
        if (attempts.length === 0)
            throw new Error('No attempts found for this test');
        // 4. Prepare result records
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
                schoolId: tenantId, // include for create/upsert
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
