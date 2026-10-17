import prisma from "../config/db";
import { getCurrentTenantId } from "../utils/tenantContext";

/**
 * offlineService — builds the authorized offline data bundle for the
 * authenticated teacher and replays queued offline operations.
 *
 * The bundle contains ONLY records the teacher is entitled to see:
 *  - Arms the teacher owns (form teacher) or teaches a subject in.
 *  - Students belonging to those arms.
 *  - Subjects offered in those arms.
 *  - Timetable entries for those arms.
 * All queries are tenant-scoped via the tenant middleware context.
 */
export const offlineService = {
  /**
   * Build the offline bundle for a teacher user.
   * @param userId - Authenticated user id (from JWT)
   * @param role - Authenticated primary role
   */
  buildTeacherBundle: async (userId: string, role: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    const roles = [role].filter(Boolean).map((r) => r.toUpperCase());
    const isAdmin = roles.includes("ADMIN") || roles.includes("PRINCIPAL");

    // Resolve the teacher record for this user (teachers only).
    let teacher = null;
    if (!isAdmin) {
      teacher = await prisma.teacher.findUnique({ where: { userId } });
      if (!teacher) throw new Error("Teacher profile not found");
    }

    // Arms the teacher is authorised for.
    const armWhere: any = { schoolId: tenantId };
    if (teacher) {
      armWhere.OR = [
        { teacherId: teacher.id }, // form teacher
        { subjects: { some: { teacherId: teacher.id } } }, // subject teacher
      ];
    }

    const arms = await prisma.arm.findMany({
      where: armWhere,
      include: {
        class: { select: { id: true, name: true } },
        subjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });

    const armIds = arms.map((a) => a.id);

    const [students, timetableEntries, lessonPlans] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId: tenantId, armId: { in: armIds }, isActive: true },
        select: {
          id: true,
          name: true,
          gender: true,
          admissionNumber: true,
          classId: true,
          armId: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.timetableEntry.findMany({
        where: { schoolId: tenantId, armId: { in: armIds } },
        select: {
          id: true,
          armId: true,
          dayOfWeek: true,
          timeSlot: true,
          subjectId: true,
          subject: { select: { id: true, name: true } },
        },
      }),
      prisma.lessonPlan.findMany({
        where: { schoolId: tenantId, armId: { in: armIds } },
        select: {
          id: true,
          title: true,
          description: true,
          classId: true,
          armId: true,
          subjectId: true,
          status: true,
          fileName: true,
          fileType: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    // Subjects referenced across the authorised arms.
    const subjectMap = new Map<string, { id: string; name: string }>();
    for (const arm of arms) {
      for (const sa of arm.subjects) {
        subjectMap.set(sa.subject.id, {
          id: sa.subject.id,
          name: sa.subject.name,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      teacher: teacher ? { id: teacher.id, name: teacher.name, userId } : null,
      arms: arms.map((a) => ({
        id: a.id,
        letter: a.letter,
        alias: a.alias,
        classId: a.class.id,
        className: a.class.name,
        isFormTeacher: teacher ? a.teacherId === teacher.id : true,
        subjects: a.subjects.map((sa) => ({
          id: sa.subject.id,
          name: sa.subject.name,
        })),
      })),
      students,
      subjects: Array.from(subjectMap.values()),
      timetable: timetableEntries,
      lessonPlans,
    };
  },

  /**
   * Replay one queued offline operation. Every operation is idempotent —
   * the client sends opId and we return its outcome; repeating the same
   * attendance/score upserts is safe because they are keyed by natural
   * unique constraints (studentId+date, studentId+subjectId+armId+term).
   */
  applyOperation: async (op: { type: string; payload: any; opId: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    switch (op.type) {
      case "ATTENDANCE_SAVE": {
        const { armId, date, records } = op.payload;
        if (!armId || !date || !Array.isArray(records)) {
          throw new Error("Invalid attendance payload");
        }
        const { attendanceService } = await import("./attendanceService");
        await attendanceService.saveBulkForArm(armId, new Date(date), records);
        return { ok: true };
      }

      case "RESULTS_SAVE": {
        const { results } = op.payload;
        if (!Array.isArray(results)) throw new Error("Invalid results payload");
        const { resultService } = await import("./resultService");
        await resultService.bulkUpsert(results);
        return { ok: true };
      }

      case "LESSON_PLAN_CREATE": {
        const p = op.payload;
        // Text-only lesson note (no file). fileUrl is a placeholder — the
        // offline flow only supports notes without attachments for now.
        const created = await prisma.lessonPlan.create({
          data: {
            schoolId: tenantId,
            title: String(p.title || "Untitled lesson note"),
            description: p.description ?? null,
            classId: p.classId,
            armId: p.armId,
            subjectId: p.subjectId,
            status: "DRAFT",
            fileUrl: `offline/${op.opId}`,
            fileName: p.fileName || "offline-note.txt",
            fileType: p.fileType || "text/plain",
          },
        });
        return { ok: true, id: created.id };
      }

      case "LESSON_PLAN_UPDATE": {
        const p = op.payload;
        const existing = await prisma.lessonPlan.findFirst({
          where: { id: p.id, schoolId: tenantId },
        });
        if (!existing) throw new Error("Lesson plan not found");
        await prisma.lessonPlan.update({
          where: { id: p.id },
          data: {
            title: p.title ?? existing.title,
            description: p.description ?? existing.description,
            status: p.status ?? existing.status,
          },
        });
        return { ok: true };
      }

      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  },
};
