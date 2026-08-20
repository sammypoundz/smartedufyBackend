"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentController = void 0;
const studentService_1 = require("../services/studentService");
const studentValidation_1 = require("../validations/studentValidation");
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const db_1 = __importDefault(require("../config/db"));
// --- Schemas ---
const createStudentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    gender: zod_1.z.string().optional(),
    admissionNumber: zod_1.z.string().optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
});
// ✅ parentId accepts null (for unassigning)
const updateStudentSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    gender: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    admissionNumber: zod_1.z.string().optional(),
    classId: zod_1.z.string().optional(),
    armId: zod_1.z.string().optional(),
    parentId: zod_1.z.string().nullable().optional(),
    newParent: zod_1.z.object({
        name: zod_1.z.string(),
        email: zod_1.z.string().email(),
        phone: zod_1.z.string().optional(),
    }).optional(),
    guardianRelationship: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(),
}).refine(data => !(data.parentId && data.newParent), {
    message: "Cannot provide both parentId and newParent",
});
const updateSubjectsSchema = zod_1.z.object({
    subjectIds: zod_1.z.array(zod_1.z.string()),
});
exports.studentController = {
    // ---------- Public validation endpoint ----------
    validateByAdmission: async (req, res) => {
        const { admissionNumber, armId } = req.query;
        if (!admissionNumber || !armId) {
            return res.status(400).json({ error: 'admissionNumber and armId are required' });
        }
        try {
            const student = await db_1.default.student.findFirst({
                where: {
                    admissionNumber: String(admissionNumber),
                    armId: String(armId),
                },
            });
            res.json({ exists: !!student });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Validation failed' });
        }
    },
    // ---------- Get authenticated student's own profile ----------
    getMe: async (req, res) => {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        try {
            const student = await db_1.default.student.findUnique({
                where: { userId },
                include: {
                    arm: { include: { class: true } },
                    user: { select: { email: true, role: true } },
                },
            });
            if (!student)
                return res.status(404).json({ error: 'Student profile not found' });
            res.json(student);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch profile' });
        }
    },
    // ---------- Existing endpoints ----------
    getAll: async (req, res) => {
        try {
            const armId = req.query.armId;
            const students = await studentService_1.studentService.getAll(armId);
            res.json(students);
        }
        catch (err) {
            console.error('Get all students error:', err);
            res.status(500).json({ error: 'Failed to fetch students' });
        }
    },
    getByArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const students = await studentService_1.studentService.getByArmId(armId);
            res.json(students);
        }
        catch (err) {
            console.error('Get students by arm error:', err);
            res.status(500).json({ error: 'Failed to fetch students for arm' });
        }
    },
    getByClass: async (req, res) => {
        const classId = (0, paramUtils_1.getStringParam)(req.params.classId);
        if (!classId)
            return res.status(400).json({ error: 'Invalid classId' });
        try {
            const students = await studentService_1.studentService.getByClassId(classId);
            res.json(students);
        }
        catch (err) {
            console.error('Get students by class error:', err);
            res.status(500).json({ error: 'Failed to fetch students for class' });
        }
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const student = await studentService_1.studentService.getById(id);
            if (!student)
                return res.status(404).json({ error: 'Student not found' });
            const userRole = req.user?.role;
            const userId = req.user?.id;
            if (userRole === 'STUDENT') {
                const requestingStudent = await db_1.default.student.findUnique({
                    where: { userId },
                    select: { id: true },
                });
                if (!requestingStudent || requestingStudent.id !== id) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
            }
            res.json(student);
        }
        catch (err) {
            console.error('Get student by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch student' });
        }
    },
    create: async (req, res) => {
        try {
            const data = createStudentSchema.parse(req.body);
            const student = await studentService_1.studentService.create(data);
            res.status(201).json(student);
        }
        catch (err) {
            console.error('Create student error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to create student' });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = updateStudentSchema.parse(req.body);
            let dateOfBirth = data.dateOfBirth;
            if (dateOfBirth) {
                dateOfBirth = new Date(dateOfBirth).toISOString();
            }
            // Convert null parentId to undefined for service
            const parentId = data.parentId === null ? undefined : data.parentId;
            const updated = await studentService_1.studentService.update(id, {
                name: data.name,
                gender: data.gender,
                dateOfBirth: dateOfBirth,
                address: data.address,
                admissionNumber: data.admissionNumber,
                classId: data.classId,
                armId: data.armId,
                parentId: parentId,
                newParent: data.newParent,
                guardianRelationship: data.guardianRelationship,
                isActive: data.isActive,
            });
            if (!updated)
                return res.status(404).json({ error: 'Student not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update student error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to update student' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await studentService_1.studentService.delete(id);
            res.json({ message: 'Student deleted' });
        }
        catch (err) {
            console.error('Delete student error:', err);
            res.status(500).json({ error: 'Failed to delete student' });
        }
    },
    assignParent: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const { parentId } = studentValidation_1.assignParentSchema.parse(req.body);
            const updated = await studentService_1.studentService.assignParent(id, parentId);
            if (!updated)
                return res.status(404).json({ error: 'Student not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Assign parent error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to assign parent' });
        }
    },
    // ---------- NEW: Unassign parent (now uses service) ----------
    unassignParent: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const updated = await studentService_1.studentService.unassignParent(id);
            res.json(updated);
        }
        catch (err) {
            console.error('Unassign parent error:', err);
            if (err.code === 'P2025') {
                return res.status(404).json({ error: 'Student not found' });
            }
            res.status(500).json({ error: 'Failed to unassign parent' });
        }
    },
    // ---------- Subject management ----------
    getStudentSubjects: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const subjects = await studentService_1.studentService.getStudentSubjects(id);
            res.json(subjects);
        }
        catch (err) {
            console.error('Get student subjects error:', err);
            res.status(500).json({ error: 'Failed to fetch student subjects' });
        }
    },
    updateStudentSubjects: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const { subjectIds } = updateSubjectsSchema.parse(req.body);
            const updated = await studentService_1.studentService.updateStudentSubjects(id, subjectIds);
            res.json(updated);
        }
        catch (err) {
            console.error('Update student subjects error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to update student subjects' });
        }
    },
    // ---------- Parent management ----------
    getAllParents: async (req, res) => {
        try {
            const parents = await studentService_1.studentService.getAllParents();
            res.json(parents);
        }
        catch (err) {
            console.error('Get all parents error:', err);
            res.status(500).json({ error: 'Failed to fetch parents' });
        }
    },
    createParent: async (req, res) => {
        try {
            const parentData = zod_1.z.object({
                name: zod_1.z.string().min(1),
                email: zod_1.z.string().email(),
                phone: zod_1.z.string().optional(),
            }).parse(req.body);
            const parent = await studentService_1.studentService.createParent(parentData);
            res.status(201).json(parent);
        }
        catch (err) {
            console.error('Create parent error:', err);
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            res.status(500).json({ error: 'Failed to create parent' });
        }
    },
    // ---------- Attendance, Fees, Results ----------
    getStudentAttendance: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const records = await studentService_1.studentService.getStudentAttendance(id);
            res.json(records);
        }
        catch (err) {
            console.error('Get student attendance error:', err);
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
    getStudentFees: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const fees = await studentService_1.studentService.getStudentFees(id);
            res.json(fees);
        }
        catch (err) {
            console.error('Get student fees error:', err);
            res.status(500).json({ error: 'Failed to fetch fee records' });
        }
    },
    getStudentResults: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const results = await studentService_1.studentService.getStudentResults(id);
            res.json(results);
        }
        catch (err) {
            console.error('Get student results error:', err);
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    },
};
