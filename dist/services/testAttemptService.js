"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAttemptService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.testAttemptService = {
    submit: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const questions = await db_1.default.question.findMany({
            where: { testId: data.testId },
        });
        let correctCount = 0;
        for (const answer of data.answers) {
            const question = questions.find(q => q.id === answer.questionId);
            if (question && question.correctOption === answer.selectedOption) {
                correctCount++;
            }
        }
        const total = questions.length;
        const percentage = total === 0 ? 0 : (correctCount / total) * 100;
        const attempt = await db_1.default.testAttempt.create({
            data: {
                testId: data.testId,
                studentId: data.studentId,
                answers: JSON.stringify(data.answers),
                score: correctCount,
                total,
                percentage,
                startedAt: data.startedAt,
                submittedAt: data.submittedAt,
                schoolId: tenantId,
            },
        });
        return { score: correctCount, total, percentage };
    },
    // Get all attempts for a test, with student details and computed fields
    getByTestId: async (testId) => {
        // middleware adds schoolId to the where clause automatically
        const attempts = await db_1.default.testAttempt.findMany({
            where: { testId },
            include: {
                student: {
                    select: {
                        name: true,
                        admissionNumber: true,
                    },
                },
            },
            orderBy: { submittedAt: 'desc' },
        });
        return attempts.map(attempt => {
            let completed = false;
            try {
                const answersArray = JSON.parse(attempt.answers);
                completed = answersArray.every(a => a.selectedOption !== -1);
            }
            catch {
                completed = false;
            }
            const timeTakenSeconds = (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000;
            return {
                id: attempt.id,
                studentId: attempt.studentId,
                studentName: attempt.student.name,
                admissionNumber: attempt.student.admissionNumber,
                score: attempt.score,
                total: attempt.total,
                percentage: attempt.percentage,
                completed,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                timeTakenSeconds,
            };
        });
    },
    // Get all attempts for a specific student, with test details
    getByStudentId: async (studentId) => {
        // middleware adds schoolId to the where clause automatically
        const attempts = await db_1.default.testAttempt.findMany({
            where: { studentId },
            include: {
                test: {
                    select: {
                        id: true,
                        name: true,
                        duration: true,
                    },
                },
            },
            orderBy: { submittedAt: 'desc' },
        });
        return attempts.map(attempt => {
            let completed = false;
            try {
                const answersArray = JSON.parse(attempt.answers);
                completed = answersArray.every(a => a.selectedOption !== -1);
            }
            catch {
                completed = false;
            }
            const timeTakenSeconds = (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000;
            return {
                id: attempt.id,
                testId: attempt.testId,
                testName: attempt.test.name,
                testDuration: attempt.test.duration,
                score: attempt.score,
                total: attempt.total,
                percentage: attempt.percentage,
                completed,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                timeTakenSeconds,
            };
        });
    },
};
