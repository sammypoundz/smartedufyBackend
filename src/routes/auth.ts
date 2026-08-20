import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { registerSchema, loginSchema } from '../validations/authValidation';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Register a new user (staff/admin – not for students)
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const { schoolId } = data;
    if (!schoolId) {
      return res.status(400).json({ error: 'schoolId is required' });
    }
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return res.status(400).json({ error: 'Invalid school' });
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role as any,
        isActive: true,
        schoolId,
      },
    });

    if (data.role === 'STUDENT') {
      await prisma.student.create({
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
    } else if (data.role === 'TEACHER') {
      await prisma.teacher.create({
        data: {
          userId: user.id,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          schoolId,
        },
      });
    } else if (data.role === 'PARENT') {
      await prisma.parent.create({
        data: {
          userId: user.id,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          schoolId,
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, schoolId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

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
  } catch (err) {
    next(err);
  }
});

// Login – no schoolId in request; derived from the user record
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: true,
        teacher: true,
        parent: true,
      },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

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

    const token = jwt.sign(
      { id: user.id, role: user.role, schoolId: user.schoolId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

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
  } catch (err) {
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

    const student = await prisma.student.findFirst({
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

    const token = jwt.sign(
      {
        id: student.id,
        role: 'STUDENT',
        admissionNumber: student.admissionNumber,
        schoolId: student.schoolId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '2h' }
    );

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
  } catch (err) {
    next(err);
  }
});

// Get current authenticated user (for staff/admin)
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: true,
        teacher: true,
        parent: true,
        school: { select: { id: true, name: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = user.student || user.teacher || user.parent;
    res.json({ ...user, profile });
  } catch (err) {
    next(err);
  }
});

export default router;