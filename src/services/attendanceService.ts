import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const attendanceService = {
  /**
   * Get attendance records for a specific student.
   * @param studentId - The student ID
   * @returns Array of { date, present } records ordered by date descending
   */
  getByStudentId: (studentId: string) =>
    prisma.attendance.findMany({
      where: { studentId }, // middleware adds schoolId
      select: { date: true, present: true },
      orderBy: { date: 'desc' },
    }),

  /**
   * Get attendance records for a specific arm, optionally filtered by date range.
   * @param armId - The arm ID
   * @param startDate - Optional start date (inclusive)
   * @param endDate - Optional end date (inclusive)
   * @returns Array of attendance records (without student details, only studentId and date)
   */
  getByArmAndDateRange: (armId: string, startDate?: Date, endDate?: Date) => {
    const where: any = { student: { armId } };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }
    return prisma.attendance.findMany({
      where,
      select: { studentId: true, date: true, present: true },
      orderBy: { date: 'asc' },
    }); // middleware adds schoolId to the Attendance model
  },

  /**
   * Legacy: Get attendance for a specific arm, optionally filtered by exact date.
   * Returns records with student details.
   * @deprecated Use getByArmAndDateRange instead.
   */
  getByArmAndDate: (armId: string, date?: Date) => {
    const where: any = { student: { armId } };
    if (date) where.date = date;
    return prisma.attendance.findMany({
      where,
      include: { student: true },
      orderBy: { date: 'desc' },
    }); // middleware adds schoolId
  },

  /**
   * Save attendance for multiple students in an arm on a given date.
   * Uses upsert (update if exists, create otherwise).
   * @param armId - The arm ID (used to validate that students belong to this arm)
   * @param date - The date of attendance
   * @param records - Array of { studentId, present }
   * @returns Array of upserted attendance records
   */
  saveBulkForArm: async (armId: string, date: Date, records: { studentId: string; present: boolean }[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // Verify all studentIds belong to the given arm and tenant
    const studentIds = records.map(r => r.studentId);
    const validStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        armId,
        schoolId: tenantId, // ensure tenant scope
      },
      select: { id: true },
    });
    const validIds = new Set(validStudents.map(s => s.id));
    const invalid = records.filter(r => !validIds.has(r.studentId));
    if (invalid.length) {
      throw new Error(`Students ${invalid.map(i => i.studentId).join(', ')} do not belong to this arm`);
    }

    // Upsert each record
    const results = await Promise.all(
      records.map(record =>
        prisma.attendance.upsert({
          where: {
            studentId_date: {
              studentId: record.studentId,
              date: date,
            },
          },
          update: { present: record.present },
          create: {
            studentId: record.studentId,
            date: date,
            present: record.present,
            schoolId: tenantId, // 👈 required for create
          },
        })
      )
    );
    return results;
  },

  /**
   * Legacy: Mark attendance for multiple students on a given date.
   * Deletes existing records for these students on the same date, then creates new ones.
   * Does NOT validate arm membership.
   * @deprecated Use saveBulkForArm instead.
   */
  markBulk: async (date: Date, records: { studentId: string; present: boolean }[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const studentIds = records.map(r => r.studentId);
    await prisma.attendance.deleteMany({
      where: {
        date,
        studentId: { in: studentIds },
        // middleware adds schoolId to where
      },
    });
    return Promise.all(
      records.map(record =>
        prisma.attendance.create({
          data: {
            date,
            studentId: record.studentId,
            present: record.present,
            schoolId: tenantId, // 👈 required for create
          },
        })
      )
    );
  },

  /**
   * Update a single attendance record (by its ID).
   * @param id - Attendance record ID
   * @param present - New present status
   * @returns Updated attendance record
   */
  update: (id: string, present: boolean) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.attendance.update({
      where: { id, schoolId: tenantId }, // ensure tenant scope
      data: { present },
    });
  },

  /**
   * Delete a single attendance record.
   * @param id - Attendance record ID
   */
  delete: (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.attendance.delete({
      where: { id, schoolId: tenantId },
    });
  },
};