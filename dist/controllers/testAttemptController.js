"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAttemptController = void 0;
const testAttemptService_1 = require("../services/testAttemptService");
const paramUtils_1 = require("../utils/paramUtils");
const db_1 = __importDefault(require("../config/db")); // ✅ import prisma
exports.testAttemptController = {
    submit: async (req, res) => {
        const { testId, studentId, answers, startedAt, submittedAt } = req.body;
        if (!testId || !studentId || !answers) {
            return res.status(400).json({ error: 'Missing required fields: testId, studentId, answers' });
        }
        if (!Array.isArray(answers)) {
            return res.status(400).json({ error: 'answers must be an array' });
        }
        try {
            const result = await testAttemptService_1.testAttemptService.submit({
                testId,
                studentId,
                answers,
                startedAt: new Date(startedAt),
                submittedAt: new Date(submittedAt),
            });
            res.json(result);
        }
        catch (err) {
            console.error('Submit test attempt error:', err);
            res.status(500).json({ error: 'Failed to submit test' });
        }
    },
    // Get all attempts for a test (admin/teacher only)
    getByTestId: async (req, res) => {
        const testId = (0, paramUtils_1.getStringParam)(req.params.testId);
        if (!testId)
            return res.status(400).json({ error: 'Invalid testId' });
        const userRole = req.user?.role;
        if (userRole !== 'ADMIN' && userRole !== 'TEACHER') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        try {
            const attempts = await testAttemptService_1.testAttemptService.getByTestId(testId);
            res.json(attempts);
        }
        catch (err) {
            console.error('Get attempts by test error:', err);
            res.status(500).json({ error: 'Failed to fetch test attempts' });
        }
    },
    // Get attempts for a specific student (self or admin/teacher)
    getByStudentId: async (req, res) => {
        const studentId = (0, paramUtils_1.getStringParam)(req.params.studentId);
        if (!studentId)
            return res.status(400).json({ error: 'Invalid studentId' });
        const userId = req.user?.id;
        const userRole = req.user?.role;
        // If the requester is a student, ensure they are requesting their own data
        if (userRole === 'STUDENT') {
            const student = await db_1.default.student.findUnique({ where: { userId }, select: { id: true } });
            if (!student || student.id !== studentId) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }
        else if (userRole !== 'ADMIN' && userRole !== 'TEACHER') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        try {
            const attempts = await testAttemptService_1.testAttemptService.getByStudentId(studentId);
            res.json(attempts);
        }
        catch (err) {
            console.error('Get attempts by student error:', err);
            res.status(500).json({ error: 'Failed to fetch student attempts' });
        }
    },
};
