"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultController = void 0;
const resultService_1 = require("../services/resultService");
const resultValidation_1 = require("../validations/resultValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
// Schema for pushing test attempts to results
const pushTestAttemptsSchema = zod_1.z.object({
    testId: zod_1.z.string(),
    academicYearId: zod_1.z.string(),
    term: zod_1.z.string(),
    resultType: zod_1.z.enum(['ca', 'exam']),
});
exports.resultController = {
    /**
     * GET /api/results/history?armId=...
     */
    getHistory: async (req, res) => {
        const armId = req.query.armId;
        if (!armId)
            return res.status(400).json({ error: 'armId is required' });
        try {
            const history = await resultService_1.resultService.getHistory(armId);
            res.json(history);
        }
        catch (err) {
            console.error('Get history error:', err);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    },
    getByStudent: async (req, res) => {
        const studentId = (0, paramUtils_1.getStringParam)(req.params.studentId);
        if (!studentId)
            return res.status(400).json({ error: 'Invalid studentId' });
        const term = req.query.term;
        const academicYearId = req.query.academicYearId;
        try {
            const results = await resultService_1.resultService.getByStudentId(studentId, academicYearId, term);
            res.json(results);
        }
        catch (err) {
            console.error('Get results by student error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
    getByArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        const term = req.query.term;
        const academicYearId = req.query.academicYearId;
        try {
            const results = await resultService_1.resultService.getByArmId(armId, term, academicYearId);
            res.json(results);
        }
        catch (err) {
            console.error('Get results by arm error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
    getBySubject: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.subjectId);
        if (!subjectId)
            return res.status(400).json({ error: 'Invalid subjectId' });
        const term = req.query.term;
        const academicYearId = req.query.academicYearId;
        try {
            const results = await resultService_1.resultService.getBySubjectId(subjectId, term, academicYearId);
            res.json(results);
        }
        catch (err) {
            console.error('Get results by subject error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
    getByFilters: async (req, res) => {
        const armId = req.query.armId;
        const subjectId = req.query.subjectId;
        const term = req.query.term;
        const academicYearId = req.query.academicYearId;
        if (!armId || !term) {
            return res.status(400).json({ error: 'Missing required query parameters: armId, term' });
        }
        try {
            let results;
            if (subjectId) {
                results = await resultService_1.resultService.getByArmSubjectTerm(armId, subjectId, term, academicYearId);
            }
            else {
                results = await resultService_1.resultService.getByArmTerm(armId, term, academicYearId);
            }
            res.json(results);
        }
        catch (err) {
            console.error('Get results by filters error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
    getByAcademicYear: async (req, res) => {
        const academicYearId = (0, paramUtils_1.getStringParam)(req.params.academicYearId);
        if (!academicYearId)
            return res.status(400).json({ error: 'Invalid academicYearId' });
        try {
            const results = await resultService_1.resultService.getByAcademicYear(academicYearId);
            res.json(results);
        }
        catch (err) {
            console.error('Get results by academic year error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
    create: async (req, res) => {
        try {
            const data = resultValidation_1.createResultSchema.parse(req.body);
            let resultData;
            if (data.ca !== undefined && data.exam !== undefined) {
                if (!data.armId) {
                    return res.status(400).json({ error: 'armId is required when using ca/exam' });
                }
                const total = data.ca + data.exam;
                resultData = {
                    studentId: data.studentId,
                    subjectId: data.subjectId,
                    armId: data.armId,
                    term: data.term,
                    ca: data.ca,
                    exam: data.exam,
                    total,
                    grade: data.grade,
                    academicYearId: data.academicYearId,
                };
            }
            else if (data.score !== undefined) {
                return res.status(400).json({ error: 'The "score" field is deprecated. Please use "ca" and "exam" instead.' });
            }
            else {
                return res.status(400).json({ error: 'Invalid data: provide either (ca+exam) or (score)' });
            }
            const result = await resultService_1.resultService.create(resultData);
            res.status(201).json(result);
        }
        catch (err) {
            console.error('Create result error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create result' });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = resultValidation_1.updateResultSchema.parse(req.body);
            const updatePayload = { ...data };
            if (data.ca !== undefined && data.exam !== undefined) {
                const total = data.ca + data.exam;
                updatePayload.total = total;
                updatePayload.score = total;
            }
            else if (data.total !== undefined) {
                updatePayload.score = data.total;
            }
            else if (data.score !== undefined) {
                updatePayload.total = data.score;
            }
            const updated = await resultService_1.resultService.update(id, updatePayload);
            if (!updated)
                return res.status(404).json({ error: 'Result not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update result error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update result' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await resultService_1.resultService.delete(id);
            res.json({ message: 'Result deleted' });
        }
        catch (err) {
            console.error('Delete result error:', err);
            res.status(500).json({ error: 'Failed to delete result' });
        }
    },
    bulkUpsert: async (req, res) => {
        try {
            const { results } = resultValidation_1.bulkResultSchema.parse(req.body);
            const updated = await resultService_1.resultService.bulkUpsert(results);
            res.status(200).json({ message: `${updated.length} results saved` });
        }
        catch (err) {
            console.error('Bulk upsert error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to save results' });
        }
    },
    pushTestAttemptsToResults: async (req, res) => {
        try {
            const data = pushTestAttemptsSchema.parse(req.body);
            const result = await resultService_1.resultService.pushTestAttemptsToResults(data);
            res.json({ message: `Successfully pushed ${result.count} results to ${data.resultType}` });
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error('Push test attempts error:', err);
            // If the error message indicates a missing test or no attempts, return 404
            if (err.message === 'Test not found' || err.message === 'No attempts found for this test') {
                return res.status(404).json({ error: err.message });
            }
            res.status(500).json({ error: err.message || 'Failed to push results' });
        }
    },
};
