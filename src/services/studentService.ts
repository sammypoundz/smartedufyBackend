import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getCurrentTenantId } from '../utils/tenantContext';
import { syncService } from './syncService';

/*
 * Student identity helpers
 * ------------------------
 * A student's login email is NEVER derived from their name alone: two
 * students called "John Musa" (same class, same school, or different
 * schools) must both register successfully. Instead we derive a base from
 * the name and, on collision, append a short random suffix until the
 * generated email is free. Names are contact info, not identity.
 */
function emailSlug(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$|\.{2,}/g, '.');
  return slug || 'student';
}

/**
 * Find a free <slug>@student.smartedufy.com login email.
 * Tries the bare slug first (keeps existing emails stable for the common
 * case), then appends short random suffixes. Retries bound the loop so a
 * pathological name can never hang the request.
 */
async function allocateStudentEmail(name: string): Promise<string> {
  const slug = emailSlug(name);
  const domain = '@student.smartedufy.com';
  if (!(await prisma.user.findUnique({ where: { email: `${slug}${domain}` } }))) {
    return `${slug}${domain}`;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = crypto.randomBytes(2).toString('hex'); // e.g. "3f9a"
    const candidate = `${slug}.${suffix}${domain}`;
    if (!(await prisma.user.findUnique({ where: { email: candidate } }))) {
      return candidate;
    }
  }
  // Practically unreachable fallback: timestamp guarantees freshness.
  return `${slug}.${Date.now()}${domain}`;
}

/**
 * Create the login account for a student, retrying on email collisions.
 *
 * The pre-check in allocateStudentEmail is not atomic: two concurrent
 * creations (or two rows in one bulk upload) can both see an email as
 * "free" and then race on insert. Instead of failing with a raw P2002,
 * we catch the unique-violation and retry with a fresh suffix. The final
 * fallback embeds a millisecond timestamp + random bytes, which cannot
 * collide with an email allocated earlier in the same run.
 */
async function createStudentUser(tenantId: string, name: string): Promise<{ id: string; email: string }> {
  const slug = emailSlug(name);
  const domain = '@student.smartedufy.com';
  const tempPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const email =
      attempt === 0
        ? await allocateStudentEmail(name) // bare slug, then random suffixes
        : `${slug}.${crypto.randomBytes(3).toString('hex')}${domain}`; // wider space
    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'STUDENT',
          isActive: true,
          schoolId: tenantId,
        },
      });
      return user;
    } catch (err: any) {
      const target = err?.meta?.target;
      const isEmailDup =
        err?.code === 'P2002' &&
        (target == null ||
          (Array.isArray(target) ? target : [target]).some((t: any) => String(t).includes('email')));
      if (!isEmailDup) throw err;
      lastError = err;
    }
  }
  // Guaranteed-unique fallback: timestamp makes a prior collision impossible.
  const email = `${slug}.${Date.now()}${crypto.randomBytes(2).toString('hex')}${domain}`;
  try {
    return await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'STUDENT', isActive: true, schoolId: tenantId },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new Error(
        `Could not allocate a unique login email for "${name}". Please try again.`,
      );
    }
    throw err;
  }
}

/**
 * Allocate the next globally-unique human student code (STD-000001).
 * Independent of name/email/phone/admission number. Uses a count-based
 * starting point then walks forward past any collisions.
 */
async function allocateStudentCode(): Promise<string> {
  const highest = await prisma.student.findFirst({
    where: { studentCode: { not: null } },
    orderBy: { studentCode: 'desc' },
    select: { studentCode: true },
  });
  const last = highest?.studentCode?.match(/^STD-(\d+)$/);
  let next = last ? parseInt(last[1], 10) : 0;
  for (let i = 0; i < 1000; i++) {
    next += 1;
    const code = `STD-${String(next).padStart(6, '0')}`;
    if (!(await prisma.student.findUnique({ where: { studentCode: code } }))) {
      return code;
    }
  }
  // Extremely large datasets: fall back to randomness (still STD-prefixed).
  return `STD-${Date.now().toString().slice(-9).padStart(6, '0')}`;
}

/** Translate the Mongo duplicate-key error on the school-scoped admission
 *  number index into a friendly, school-local message. */
function isAdmissionDupError(err: any): boolean {
  return (
    err?.code === 'P2002' &&
    Array.isArray(err?.meta?.target) &&
    err.meta.target.some((t: string) => String(t).includes('admissionNumber'))
  );
}

export const studentService = {
  // ---------- Existing methods ----------
  getAll: async (armId?: string) => {
    const where: any = {};
    if (armId) where.armId = armId;
    return prisma.student.findMany({
      where,
      include: { parent: true, class: true, arm: { include: { class: true } }, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getByArmId: (armId: string | null | undefined) => {
    if (!armId) throw new Error('Arm ID is required');
    return prisma.student.findMany({
      where: { armId },
      include: { parent: true, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getByClassId: (classId: string | null | undefined) => {
    if (!classId) throw new Error('Class ID is required');
    return prisma.student.findMany({
      where: { classId },
      include: { parent: true, arm: true, user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    }); // middleware adds schoolId
  },

  getById: (id: string | null | undefined) => {
    if (!id) throw new Error('Student ID is required');
    return prisma.student.findUnique({
      where: { id },
      include: { parent: true, class: true, arm: true, attendance: true, results: true },
    }); // middleware adds schoolId
  },

  getByUserId: (userId: string | null | undefined) => {
    if (!userId) throw new Error('User ID is required');
    return prisma.student.findUnique({
      where: { userId },
      include: {
        arm: { include: { class: true } },
        user: { select: { email: true, role: true } },
        parent: true,
      },
    }); // middleware adds schoolId
  },

  findByAdmissionAndArm: (admissionNumber: string, armId: string) => {
    return prisma.student.findFirst({
      where: { admissionNumber, armId },
      include: { arm: { include: { class: true } } },
    }); // middleware adds schoolId
  },

  /**
   * Register a student in the current school.
   *
   * Identity rules:
   *  - Same NAME as another student (same class/school or elsewhere) → always
   *    allowed; each gets their own login account with a unique email.
   *  - Same ADMISSION NUMBER in ANOTHER school → allowed (school-scoped).
   *  - Same ADMISSION NUMBER in THIS school → rejected with a clear message
   *    (the DB enforces it too, via the compound unique index).
   *  - Parent emails/phones are contact info, never identity.
   */
  create: async (data: { name: string; gender?: string; religion?: string; admissionNumber?: string; classId?: string; armId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // School-scoped admission-number duplicate check — friendly message up
    // front (the DB index is the backstop under concurrency).
    const trimmedAdmission = data.admissionNumber?.trim() || undefined;
    if (trimmedAdmission) {
      const dupAdmission = await prisma.student.findFirst({
        where: { schoolId: tenantId, admissionNumber: trimmedAdmission },
        select: { id: true, name: true },
      });
      if (dupAdmission) {
        throw new Error(
          `Admission number "${trimmedAdmission}" is already used in this school by ${dupAdmission.name}. Use a different admission number.`,
        );
      }
    }

    // Class/arm must belong to this school — never allow cross-school assignment.
    if (data.classId) {
      const cls = await prisma.class.findFirst({
        where: { id: data.classId, schoolId: tenantId },
        select: { id: true },
      });
      if (!cls) throw new Error('Selected class does not belong to this school.');
    }
    if (data.armId) {
      const arm = await prisma.arm.findFirst({
        where: { id: data.armId, schoolId: tenantId },
        select: { id: true },
      });
      if (!arm) throw new Error('Selected arm does not belong to this school.');
    }

    // Login account creation retries internally on email collisions (see
    // createStudentUser) so concurrent/bulk rows can never fail with a raw
    // `users_email_key` P2002.
    const user = await createStudentUser(tenantId, data.name);

    const studentCode = await allocateStudentCode();

    try {
      return await prisma.student.create({
        data: {
          name: data.name,
          gender: data.gender || '',
          admissionNumber: trimmedAdmission,
          studentCode,
          classId: data.classId,
          armId: data.armId,
          religion: data.religion || undefined,
          userId: user.id,
          schoolId: tenantId,
        },
        include: { parent: true },
      });
    } catch (err: any) {
      // Don't leave an orphaned login account behind when the student row
      // could not be written (e.g. concurrent duplicate admission number).
      await prisma.user.deleteMany({ where: { id: user.id, role: 'STUDENT' } }).catch(() => {});
      if (isAdmissionDupError(err)) {
        throw new Error(
          `Admission number "${trimmedAdmission}" is already used in this school. Use a different admission number.`,
        );
      }
      throw err;
    }
  },

  async createParentWithUser(parentData: { name: string; email: string; phone?: string }) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    let user = await prisma.user.findUnique({ where: { email: parentData.email } });
    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      user = await prisma.user.create({
        data: {
          name: parentData.name,
          email: parentData.email,
          password: hashedPassword,
          role: 'PARENT',
          isActive: true,
          schoolId: tenantId,
        },
      });
    }
    // Ensure parent record belongs to tenant
    const existingParent = await prisma.parent.findUnique({
      where: { userId: user.id },
    });
    if (existingParent) return existingParent;
    return prisma.parent.create({
      data: {
        userId: user.id,
        name: parentData.name,
        email: parentData.email,
        phone: parentData.phone || '',
        schoolId: tenantId,
      },
    });
  },

  update: async (
    id: string | null | undefined,
    data: {
      name?: string;
      gender?: string;
      dateOfBirth?: string;
      address?: string;
      admissionNumber?: string;
      classId?: string;
      armId?: string;
      parentId?: string | null;
      newParent?: { name: string; email: string; phone?: string };
      guardianRelationship?: string;
      religion?: string;
      isActive?: boolean;
    }
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!id) throw new Error('Student ID is required');

    const updateData: Partial<{
      name: string;
      gender: string;
      dateOfBirth: Date | null;
      address: string | null;
      admissionNumber: string | null;
      classId: string | null;
      armId: string | null;
      parentId: string | null;
      guardianRelationship: string | null;
      religion: string | null;
      isActive: boolean;
    }> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.admissionNumber !== undefined) {
      const trimmed = data.admissionNumber?.trim() || null;
      if (trimmed) {
        const dup = await prisma.student.findFirst({
          where: { schoolId: tenantId, admissionNumber: trimmed, id: { not: id } },
          select: { id: true, name: true },
        });
        if (dup) {
          throw new Error(
            `Admission number "${trimmed}" is already used in this school by ${dup.name}. Use a different admission number.`,
          );
        }
      }
      updateData.admissionNumber = trimmed;
    }
    if (data.classId !== undefined) updateData.classId = data.classId;
    if (data.armId !== undefined) updateData.armId = data.armId;
    if (data.guardianRelationship !== undefined) updateData.guardianRelationship = data.guardianRelationship;
    if (data.religion !== undefined) updateData.religion = data.religion;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Handle parentId – allow null, empty string, or valid ID
    if (data.parentId !== undefined) {
      if (data.parentId) {
        const parentExists = await prisma.parent.findFirst({
          where: { id: data.parentId, schoolId: tenantId },
        });
        if (!parentExists) throw new Error('Parent not found in this tenant');
      }
      updateData.parentId = data.parentId;
    }
    if (data.newParent) {
      const newParent = await studentService.createParentWithUser(data.newParent);
      updateData.parentId = newParent.id;
    }

    const updatedStudent = await prisma.student.update({
      where: { id, schoolId: tenantId },
      data: updateData,
      include: { parent: true, class: true, arm: true },
    });

    // If the student's arm changed, re-sync subject enrolments to the new arm
    if (data.armId !== undefined) {
      await syncService.syncStudentSubjectsForStudent(tenantId, updatedStudent.id);
    }

    return updatedStudent;
  },

  assignParent: async (studentId: string | null | undefined, parentId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!studentId) throw new Error('Student ID is required');

    // Verify parent belongs to tenant
    const parentExists = await prisma.parent.findFirst({
      where: { id: parentId, schoolId: tenantId },
    });
    if (!parentExists) throw new Error('Parent not found in this tenant');

    return prisma.student.update({
      where: { id: studentId, schoolId: tenantId },
      data: { parentId },
      include: { parent: true },
    });
  },

  unassignParent: async (studentId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.student.update({
      where: { id: studentId, schoolId: tenantId },
      data: { parentId: null },
      include: { parent: true },
    });
  },

  delete: async (id: string | null | undefined) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!id) throw new Error('Student ID is required');

    /*
     * Clean up every row that references the student (parent link requests,
     * attendance, results, fees, test attempts, promotion history, subjects)
     * then delete the student and its login account — all atomically.
     * Mirrors the bulk deleteMany cleanup below; without this the student
     * delete fails on FK constraints (e.g. when assigned to a parent).
     */
    return prisma.$transaction(
      async (tx) => {
      await tx.parentStudentLink.deleteMany({ where: { studentId: id, schoolId: tenantId } });
      await tx.studentSubject.deleteMany({ where: { studentId: id, schoolId: tenantId } });
      await tx.attendance.deleteMany({ where: { studentId: id } });
      await tx.studentPromotionHistory.deleteMany({ where: { studentId: id } });
      await tx.result.deleteMany({ where: { studentId: id } });
      await tx.feePayment.deleteMany({ where: { studentId: id } });
      await tx.studentFee.deleteMany({ where: { studentId: id } });
      await tx.testAttempt.deleteMany({ where: { studentId: id } });

      const student = await tx.student.delete({
        where: { id, schoolId: tenantId },
      });
      // Remove the linked login account so the email can be reused on re-upload
      if (student.userId) {
        await tx.user.deleteMany({ where: { id: student.userId, role: 'STUDENT' } });
      }
      return student;
      },
      // Default 5s interactive timeout is too short for the many dependent
      // deleteMany calls above (especially on a student linked to a parent)
      { timeout: 20000, maxWait: 10000 },
    );
  },

  // Bulk delete students (and their related records + login accounts) scoped to the tenant
  deleteMany: async (ids: string[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!ids || ids.length === 0) throw new Error('No students selected');

    const students = await prisma.student.findMany({
      where: { id: { in: ids }, schoolId: tenantId },
      select: { id: true, userId: true },
    });
    const studentIds = students.map((s) => s.id);
    const userIds = students.map((s) => s.userId).filter(Boolean);

    await prisma.studentSubject.deleteMany({ where: { studentId: { in: studentIds }, schoolId: tenantId } });
    await prisma.parentStudentLink.deleteMany({ where: { studentId: { in: studentIds }, schoolId: tenantId } });
    await prisma.attendance.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.studentPromotionHistory.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.result.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.feePayment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.studentFee.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.testAttempt.deleteMany({ where: { studentId: { in: studentIds } } });

    await prisma.student.deleteMany({
      where: { id: { in: studentIds }, schoolId: tenantId },
    });
    // Remove linked login accounts so emails can be reused on re-upload
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds }, role: 'STUDENT' } });
    }
    return { deleted: studentIds.length };
  },

  // ---------- Additional methods ----------
  getAllParents: () =>
    prisma.parent.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }), // middleware adds schoolId

  createParent: async (data: { name: string; email: string; phone?: string }) => {
    return studentService.createParentWithUser(data);
  },

  getStudentSubjects: async (studentId: string) => {
    const links = await prisma.studentSubject.findMany({
      where: { studentId },
      include: { subject: true },
    }); // middleware adds schoolId
    return links.map(link => link.subject);
  },

  updateStudentSubjects: async (studentId: string, subjectIds: string[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Integrity: only allow subjects that exist in this school
    const schoolSubjectIds = new Set(
      (await prisma.subject.findMany({ where: { schoolId: tenantId }, select: { id: true } })).map((s) => s.id),
    );
    const invalid = subjectIds.filter((sid) => !schoolSubjectIds.has(sid));
    if (invalid.length) throw new Error('Some subjects do not belong to this school');

    await prisma.studentSubject.deleteMany({
      where: { studentId, schoolId: tenantId },
    });
    if (subjectIds.length > 0) {
      await prisma.studentSubject.createMany({
        data: subjectIds.map(subjectId => ({
          studentId,
          subjectId,
          schoolId: tenantId,
        })),
      });
    }
    return studentService.getStudentSubjects(studentId);
  },

  getStudentAttendance: (studentId: string) =>
    prisma.attendance.findMany({
      where: { studentId },
      select: { date: true, present: true },
      orderBy: { date: 'desc' },
    }), // middleware adds schoolId

  getStudentFees: async (studentId: string) => {
    try {
      return [];
    } catch {
      return [];
    }
  },

  getStudentResults: async (studentId: string) => {
    const results = await prisma.result.findMany({
      where: { studentId },
      include: { subject: true, arm: { include: { class: true } }, academicYear: true },
      orderBy: [{ term: 'desc' }, { subject: { name: 'asc' } }],
    }); // middleware adds schoolId
    return results.map(result => ({
      subject: result.subject.name,
      score: result.score,
      grade: result.grade || '',
      term: result.term,
      arm: result.arm ? `${result.arm.class?.name ?? ''} ${result.arm.letter}`.trim() : '',
      academicYear: result.academicYear?.name || '',
      ca: result.ca,
      exam: result.exam,
      total: result.total,
    }));
  },

  // Full class/grade journey of the student, oldest first
  getStudentHistory: async (studentId: string) => {
    const [promotions, student] = await Promise.all([
      prisma.studentPromotionHistory.findMany({
        where: { studentId },
        include: {
          fromArm: { include: { class: true } },
          toArm: { include: { class: true } },
          fromClass: true,
          toClass: true,
          academicYear: true,
          term: true,
        },
        orderBy: { promotedAt: 'asc' },
      }),
      prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true, name: true, admissionNumber: true, createdAt: true,
          arm: { include: { class: true } },
        },
      }),
    ]);
    if (!student) throw new Error('Student not found');

    // Build the chronological list of class placements from the promotion trail
    const placements: { className: string; arm: string; academicYear: string; term: string; promotedAt: Date }[] = [];
    if (promotions.length > 0) {
      const first = promotions[0];
      placements.push({
        className: first.fromClass?.name || first.fromArm?.class?.name || '',
        arm: first.fromArm?.letter || '',
        academicYear: first.academicYear?.name || '',
        term: first.term?.name || '',
        promotedAt: first.promotedAt,
      });
      for (const p of promotions) {
        placements.push({
          className: p.toClass?.name || p.toArm?.class?.name || '',
          arm: p.toArm?.letter || '',
          academicYear: p.academicYear?.name || '',
          term: p.term?.name || '',
          promotedAt: p.promotedAt,
        });
      }
    } else if (student.arm) {
      placements.push({
        className: student.arm.class?.name || '',
        arm: student.arm.letter,
        academicYear: '',
        term: '',
        promotedAt: student.createdAt,
      });
    }

    return { student: { id: student.id, name: student.name, admissionNumber: student.admissionNumber }, placements };
  },

  // Academic transcript across ALL classes/years the student has attended
  getStudentTranscript: async (studentId: string) => {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, name: true, admissionNumber: true, gender: true,
        arm: { include: { class: true } },
      },
    });
    if (!student) throw new Error('Student not found');

    const results = await prisma.result.findMany({
      where: { studentId },
      include: { subject: true, arm: { include: { class: true } }, academicYear: true },
      orderBy: [{ academicYearId: 'asc' }, { term: 'asc' }, { subject: { name: 'asc' } }],
    });

    // Group results by class/level then academic year
    const grouped: Record<string, {
      className: string;
      academicYear: string;
      entries: { subject: string; ca: number; exam: number; total: number; score: number; grade: string; term: string }[];
      average: number;
    }> = {};
    for (const r of results) {
      const className = r.arm ? `${r.arm.class?.name ?? ''} ${r.arm.letter}`.trim() : 'Unknown';
      const year = r.academicYear?.name || 'Unknown';
      const key = `${className}|${year}`;
      if (!grouped[key]) grouped[key] = { className, academicYear: year, entries: [], average: 0 };
      grouped[key].entries.push({
        subject: r.subject.name,
        ca: r.ca,
        exam: r.exam,
        total: r.total,
        score: r.score,
        grade: r.grade || '',
        term: r.term,
      });
    }
    const groups = Object.values(grouped).map(g => {
      g.average = g.entries.length
        ? Math.round((g.entries.reduce((s, e) => s + e.score, 0) / g.entries.length) * 100) / 100
        : 0;
      return g;
    });

    const overallAverage = results.length
      ? Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 100) / 100
      : 0;

    return {
      student: {
        id: student.id,
        name: student.name,
        admissionNumber: student.admissionNumber,
        gender: student.gender,
        currentClass: student.arm ? `${student.arm.class?.name ?? ''} ${student.arm.letter}`.trim() : '',
      },
      groups,
      overallAverage,
      totalSubjects: new Set(results.map(r => r.subjectId)).size,
    };
  },
};