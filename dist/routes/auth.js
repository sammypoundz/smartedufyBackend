"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../config/prisma");
const authValidation_1 = require("../validations/authValidation");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Register a new user (staff/admin – not for students)
router.post('/register', async (req, res, next) => {
    try {
        const data = authValidation_1.registerSchema.parse(req.body);
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const { schoolId } = data;
        if (!schoolId) {
            return res.status(400).json({ error: 'schoolId is required' });
        }
        const school = await prisma_1.prisma.school.findUnique({ where: { id: schoolId } });
        if (!school) {
            return res.status(400).json({ error: 'Invalid school' });
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: data.role,
                isActive: true,
                schoolId,
            },
        });
        if (data.role === 'STUDENT') {
            await prisma_1.prisma.student.create({
                data: {
                    userId: user.id,
                    name: data.name,
                    gender: data.gender || '',
                    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
                    address: data.address,
                    classId: data.classId || '',
                    armId: data.armId || '',
                    schoolId,
                },
            });
        }
        else if (data.role === 'TEACHER') {
            await prisma_1.prisma.teacher.create({
                data: {
                    userId: user.id,
                    name: data.name,
                    email: data.email,
                    phone: data.phone || '',
                    schoolId,
                },
            });
        }
        else if (data.role === 'PARENT') {
            await prisma_1.prisma.parent.create({
                data: {
                    userId: user.id,
                    name: data.name,
                    email: data.email,
                    phone: data.phone || '',
                    schoolId,
                },
            });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, schoolId }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                schoolId,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// Login – no schoolId in request; derived from the user record
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = authValidation_1.loginSchema.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
            include: {
                student: true,
                teacher: true,
                parent: true,
            },
        });
        if (!user)
            return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcryptjs_1.default.compare(password, user.password);
        if (!valid)
            return res.status(401).json({ error: 'Invalid credentials' });
        // Active status checks
        if (user.role === 'STUDENT' && user.student && !user.student.isActive) {
            return res.status(403).json({ error: 'Your student account is suspended. Contact admin.' });
        }
        if (user.role === 'TEACHER' && user.teacher && !user.teacher.isActive) {
            return res.status(403).json({ error: 'Your teacher account is suspended. Contact admin.' });
        }
        if (!user.isActive) {
            return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                schoolId: user.schoolId,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// Student login using admission number + armId
// (schoolId is derived from the student record)
router.post('/student-login', async (req, res, next) => {
    try {
        const { admissionNumber, armId } = req.body;
        if (!admissionNumber || !armId) {
            return res.status(400).json({ error: 'Admission number and arm ID are required' });
        }
        const student = await prisma_1.prisma.student.findFirst({
            where: {
                admissionNumber,
                armId,
            },
            include: {
                arm: { include: { class: true } },
                school: { select: { id: true, name: true } },
            },
        });
        if (!student) {
            return res.status(404).json({ error: 'Student not found in this arm' });
        }
        if (!student.isActive) {
            return res.status(403).json({ error: 'Your account is suspended. Please contact the administrator.' });
        }
        const token = jsonwebtoken_1.default.sign({
            id: student.id,
            role: 'STUDENT',
            admissionNumber: student.admissionNumber,
            schoolId: student.schoolId,
        }, process.env.JWT_SECRET, { expiresIn: '2h' });
        res.json({
            token,
            student: {
                id: student.id,
                name: student.name,
                admissionNumber: student.admissionNumber,
                className: student.arm?.class?.name,
                armLetter: student.arm?.letter,
                schoolId: student.schoolId,
                schoolName: student.school?.name,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// Get current authenticated user (for staff/admin)
router.get('/me', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                student: true,
                teacher: true,
                parent: true,
                school: { select: { id: true, name: true } },
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const profile = user.student || user.teacher || user.parent;
        res.json({ ...user, profile });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
