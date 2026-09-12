import prisma from '../config/db';
import bcrypt from 'bcryptjs';
import { getCurrentTenantId } from '../utils/tenantContext';
import { syncService } from './syncService';

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

  create: async (data: { name: string; gender?: string; admissionNumber?: string; classId?: string; armId?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const email = `${data.name.toLowerCase().replace(/\s/g, '.')}@student.smartedufy.com`;
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Reuse an existing account for this email if it has no student profile yet
    // (e.g. orphaned accounts left behind by a previous upload/cleanup). Otherwise
    // the unique email constraint would make every re-upload fail silently.
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const linkedStudent = await prisma.student.findUnique({ where: { userId: user.id } });
      if (linkedStudent) {
        throw new Error(`Student "${data.name}" already exists (login: ${email}). If this is a re-upload, use a different name or remove the duplicate.`);
      }
      if (user.schoolId !== tenantId) {
        throw new Error(`A user with email ${email} already exists in another school.`);
      }
    } else {
      user = await prisma.user.create({
        data: {
          name: data.name,
          email,
          password: hashedPassword,
          role: 'STUDENT',
          isActive: true,
          schoolId: tenantId,
        },
      });
    }

    return prisma.student.create({
      data: {
        name: data.name,
        gender: data.gender || '',
        admissionNumber: data.admissionNumber,
        classId: data.classId,
        armId: data.armId,
        userId: user.id,
        schoolId: tenantId,
      },
      include: { parent: true },
    });
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
      isActive: boolean;
    }> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.admissionNumber !== undefined) updateData.admissionNumber = data.admissionNumber;
    if (data.classId !== undefined) updateData.classId = data.classId;
    if (data.armId !== undefined) updateData.armId = data.armId;
    if (data.guardianRelationship !== undefined) updateData.guardianRelationship = data.guardianRelationship;
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