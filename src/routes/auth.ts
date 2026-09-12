import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { registerSchema, loginSchema } from '../validations/authValidation';
import { authMiddleware } from '../middleware/auth';
import { runWithTenant } from '../utils/tenantContext';
import { resolvePrivileges } from './roles';
import { logActivity } from '../services/auditService';
import { idGeneratorService } from '../services/idGeneratorService';

const router = Router();

// Public: list active schools for the teacher registration page's
// school picker (no auth required – only exposes id + name).
router.get('/schools', async (_req, res, next) => {
  try {
    const schools = await prisma.school.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ schools });
  } catch (err) {
    next(err);
  }
});

// Register a new user (staff/admin – not for students)
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const { schoolId } = data;
    if (!schoolId) {
      return res.status(400).json({ error: 'schoolId is required' });
    }
    // Friendly duplicate-email error instead of a raw Prisma unique violation
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
    }
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return res.status(400).json({ error: 'Invalid school' });
    }

    // ----- Auto / Manual ID assignment (AUTO is the default) -----
    // Create the user and their role-specific profile record atomically
    // so all necessary tables are populated together.
    // Auth routes are public (mounted before the global tenant middleware),
    // so we establish the tenant context explicitly — the ID generator reads
    // the tenant via AsyncLocalStorage and would otherwise throw
    // "Tenant context missing".
    const user = await runWithTenant(schoolId, async () => {
      const idMode = (data as any).idMode === 'MANUAL' ? 'MANUAL' : 'AUTO';
      const customId = (data as any).customId;
      let userIdCode: string | undefined;
      if (idMode === 'MANUAL' && customId?.trim()) {
        userIdCode = await idGeneratorService.registerManualId(data.role, customId);
      } else {
        userIdCode = await idGeneratorService.claimNextId(data.role);
      }

      return prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: data.role as any,
          // Self-registered teachers may log in to complete their profile
          // setup, but their registration stays PENDING until an admin
          // approves it (see teacherRegistrationService.approve).
          isActive: true,
          schoolId,
          userIdCode,
        },
      });

      if (data.role === 'STUDENT') {
        await tx.student.create({
          data: {
            userId: createdUser.id,
            name: data.name,
            gender: data.gender || '',
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            address: data.address,
            classId: data.classId || '',
            armId: data.armId || '',
            schoolId,
            admissionNumber: userIdCode,
          },
        });
      } else if (data.role === 'TEACHER') {
        await tx.teacher.create({
          data: {
            userId: createdUser.id,
            name: data.name,
            email: data.email,
            gender: data.gender || null,
            phone: data.phone || '',
            schoolId,
            registrationStatus: 'PENDING',
          },
        });
      } else if (data.role === 'PARENT') {
        await tx.parent.create({
          data: {
            userId: createdUser.id,
            name: data.name,
            email: data.email,
            phone: data.phone || '',
            schoolId,
          },
        });
      }

      return createdUser;
      });
    });

    const token = jwt.sign(
      { id: user.id, role: user.role, roles: user.roles || [user.role], schoolId },
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
        roles: user.roles || [user.role],
        isActive: user.isActive,
        schoolId,
        allowedPages: user.allowedPages || [],
        userIdCode: user.userIdCode,
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
      const status = user.teacher.registrationStatus;
      return res.status(403).json({
        error:
          status === 'REJECTED'
            ? 'Your registration was rejected. Contact the school admin.'
            : 'Your teacher account is suspended. Contact admin.',
      });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
    }

    // Normalize roles: always include the legacy primary role
    const roles = Array.from(new Set([...(user.roles || []), user.role]))
    const rolePrivileges = await resolvePrivileges(user.schoolId, roles)
    // If the admin saved an explicit page list for this user, that list IS
    // their access (override). Otherwise they fall back to role defaults.
    const privileges = (user.allowedPages || []).length > 0
      ? Array.from(new Set(user.allowedPages))
      : rolePrivileges;

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        roles,
        privileges,
        schoolId: user.schoolId,
        name: user.name,
        email: user.email,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Audit: successful login
    logActivity({
      schoolId: user.schoolId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN',
      entity: 'Auth',
      description: `Logged in`,
      method: 'POST',
      path: '/api/auth/login',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles,
        privileges,
        isActive: user.isActive,
        schoolId: user.schoolId,
        allowedPages: user.allowedPages || [],
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

    // Resolve roles + effective privileges fresh from the DB so that role or
    // privilege changes made by an admin apply without requiring a re-login.
    const roles = Array.from(new Set([...(user.roles || []), user.role]));
    // Explicit allowedPages list saved by an admin overrides role defaults.
    const privileges = (user.allowedPages || []).length > 0
      ? Array.from(new Set(user.allowedPages))
      : await resolvePrivileges(user.schoolId, roles);

    res.json({
      id: user.id,
      name: profile?.name || user.name,
      email: user.email,
      role: user.role,
      roles,
      privileges,
      allowedPages: user.allowedPages || [],
      isActive: user.isActive,
      schoolId: user.schoolId,
      school: user.school,
      profile,
    });
  } catch (err) {
    next(err);
  }
});

export default router;