// backend/src/services/teacherRegistrationService.ts
// Teacher self-registration approval workflow.
//
// When a teacher self-registers they get a Teacher record with
// registrationStatus = 'PENDING' (and their User record starts inactive so
// they can't log into the workspace before an admin approves them). The admin
// dashboard lists pending teachers; approving one:
//   - marks the teacher APPROVED and activates the user account,
//   - auto-assigns them according to their declared profile:
//       * FORM_TEACHER / BOTH  -> Arm.teacherId set for the class(es) they chose
//         (first arm of that class), and SubjectTeacher rows for the subjects
//         they declared (taught in the classes they head).
//       * SUBJECT_TEACHER / BOTH -> SubjectArm.teacherId set for every arm of
//         the chosen classes that already offers that subject, plus
//         SubjectTeacher join rows.
//       * If they listed subjects but the school hasn't created them yet,
//         missing subjects are auto-created so the assignment always lands.
import prisma from "../config/db";
import { getCurrentTenantId } from "../utils/tenantContext";

export const teacherRegistrationService = {
  /** All teachers whose self-registration is pending admin review. */
  listPending: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    return prisma.teacher.findMany({
      where: { schoolId: tenantId, registrationStatus: "PENDING" },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        phone: true,
        teacherType: true,
        briefSubjects: true,
        registrationStatus: true,
        createdAt: true,
        user: { select: { id: true, email: true, isActive: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Count of pending registrations — powers the sidebar badge. */
  countPending: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    return prisma.teacher.count({
      where: { schoolId: tenantId, registrationStatus: "PENDING" },
    });
  },

  /**
   * Approve a pending teacher registration and auto-assign them per the
   * preferences they declared during profile setup.
   */
  approve: async (teacherId: string, opts?: { makeActive?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher || teacher.schoolId !== tenantId) {
      throw new Error("Teacher not found");
    }

    const brief = (teacher.briefSubjects || {}) as {
      subjects?: string[];
      classes?: string[];
      armIds?: string[];
      subjectArms?: { subject: string; armId: string }[];
    };
    const wantedClasses = brief.classes || [];
    const wantedSubjects = brief.subjects || [];
    const wantsForm =
      teacher.teacherType === "FORM_TEACHER" || teacher.teacherType === "BOTH";
    const wantsSubject =
      teacher.teacherType === "SUBJECT_TEACHER" ||
      teacher.teacherType === "BOTH";
    // Form-teacher arms are ONLY meaningful when the teacher declared a form
    // teacher role. A subject teacher's brief may still carry arm ids (they
    // chose which arms they teach their subject in) — those must NEVER be
    // turned into Arm.teacherId (form-teacher) assignments on approval.
    const formArmIds = wantsForm ? brief.armIds || [] : [];

    // Auto-assignment can touch many arms/subjects sequentially (with slow DB
    // latency this exceeds Prisma's default 5s interactive timeout), so allow
    // a generous budget and use upserts to minimise round-trips.
    const result = await prisma.$transaction(
      async (tx) => {
      const assignedArms: string[] = [];
      const assignedSubjects: string[] = [];
      const tenantClassIds = (
        await tx.class.findMany({ where: { schoolId: tenantId }, select: { id: true } })
      ).map((c) => c.id);

      // ---- Resolve classes (by name) ----
      const classes = wantedClasses.length
        ? await tx.class.findMany({
            where: { schoolId: tenantId, name: { in: wantedClasses } },
            include: { arms: true },
          })
        : [];

      // ---- Resolve / create subjects (by name) ----
      const subjectIds: { id: string; name: string }[] = [];
      for (const name of wantedSubjects) {
        let subject = await tx.subject.findFirst({
          where: { schoolId: tenantId, name },
        });
        if (!subject) {
          // Subject doesn't exist yet — create it so the assignment lands.
          subject = await tx.subject.create({
            data: { schoolId: tenantId, name },
          });
        }
        subjectIds.push({ id: subject.id, name: subject.name });
      }

      // ---- FORM TEACHER: head the arms they picked (fall back to the first
      //      arm of each chosen class for legacy briefs) ----
      if (wantsForm) {
        if (formArmIds.length) {          const chosenArms = await tx.arm.findMany({
            where: { id: { in: formArmIds }, classId: { in: tenantClassIds } },
            include: { class: true },
          });
          for (const arm of chosenArms) {
            await tx.arm.update({
              where: { id: arm.id },
              data: { teacherId: teacher.id },
            });
            assignedArms.push(`${arm.class.name} – Arm ${arm.letter}`);
          }
          // Fallback: brief had no arm ids — head every arm of the school's
          // classes so approval never silently no-ops.
          if (assignedArms.length === 0) {
            const allArms = await tx.arm.findMany({
              where: { classId: { in: tenantClassIds } },
              include: { class: true },
              take: 1,
            });
            for (const arm of allArms) {
              await tx.arm.update({
                where: { id: arm.id },
                data: { teacherId: teacher.id },
              });
              assignedArms.push(`${arm.class.name} – Arm ${arm.letter}`);
            }
          }
        } else {
          for (const cls of classes) {
            const arm = cls.arms[0];
            if (!arm) continue;
            await tx.arm.update({
              where: { id: arm.id },
              data: { teacherId: teacher.id },
            });
            assignedArms.push(`${cls.name} (${arm.letter})`);
          }
        }
      }

      // ---- SUBJECT TEACHER: attach to subject/arms + SubjectTeacher rows ----
      // (Only creates SubjectTeacher / SubjectArm rows — never touches
      // Arm.teacherId, so a subject teacher is never made a form teacher.)
      if (wantsSubject) {
        for (const subject of subjectIds) {
          // SubjectTeacher join (teacher teaches this subject)
          await tx.subjectTeacher.upsert({
            where: {
              schoolId_subjectId_teacherId: {
                schoolId: tenantId,
                subjectId: subject.id,
                teacherId: teacher.id,
              },
            },
            create: {
              schoolId: tenantId,
              subjectId: subject.id,
              teacherId: teacher.id,
            },
            update: {},
          });

          // Attach the teacher to the subject in exactly the arms they chose
          // (subjectArms). Fallbacks for older/simpler briefs:
          //   1. all arms of the classes they chose,
          //   2. arms named by any subjectArms entries at all (subject saved
          //      without arm pairings),
          //   3. all arms in the school — so approval never silently no-ops.
          const anyPairs = brief.subjectArms ?? [];
          const pairs = anyPairs.filter((sa) => sa.subject === subject.name);
          let armTargets: { id: string; label: string }[] = pairs.length
            ? (
                await tx.arm.findMany({
                  where: {
                    id: { in: pairs.map((p) => p.armId) },
                    classId: { in: tenantClassIds },
                  },
                  include: { class: true },
                })
              ).map((arm) => ({
                id: arm.id,
                label: `${arm.class.name} – Arm ${arm.letter}`,
              }))
            : classes.flatMap((cls) =>
                cls.arms.map((arm) => ({
                  id: arm.id,
                  label: `${cls.name} – Arm ${arm.letter}`,
                })),
              );
          if (armTargets.length === 0 && anyPairs.length > 0) {
            // Brief had arm pairings but none for this subject — assign to
            // the same arms the teacher used for their other subjects.
            armTargets = (
              await tx.arm.findMany({
                where: {
                  id: {
                    in: [...new Set(anyPairs.map((p) => p.armId))],
                  },
                  classId: { in: tenantClassIds },
                },
                include: { class: true },
              })
            ).map((arm) => ({
              id: arm.id,
              label: `${arm.class.name} – Arm ${arm.letter}`,
            }));
          }
          if (armTargets.length === 0) {
            // Last resort: every arm of the school, so the teacher isn't left
            // with no assignment at all after approval.
            armTargets = (
              await tx.arm.findMany({
                where: { classId: { in: tenantClassIds } },
                include: { class: true },
              })
            ).map((arm) => ({
              id: arm.id,
              label: `${arm.class.name} – Arm ${arm.letter}`,
            }));
          }
          for (const target of armTargets) {
            await tx.subjectArm.upsert({
              where: {
                schoolId_subjectId_armId: {
                  schoolId: tenantId,
                  subjectId: subject.id,
                  armId: target.id,
                },
              },
              create: {
                schoolId: tenantId,
                subjectId: subject.id,
                armId: target.id,
                teacherId: teacher.id,
              },
              update: { teacherId: teacher.id },
            });
          }
          if (armTargets.length > 0) {
            const byClass = new Map<string, string[]>();
            for (const t of armTargets) {
              const [clsName] = t.label.split(" – Arm ");
              byClass.set(clsName, [...(byClass.get(clsName) || []), t.label]);
            }
            for (const labels of byClass.values()) {
              assignedSubjects.push(`${subject.name} → ${labels.join(", ")}`);
            }
          }
        }
      }

      // ---- Mark approved + activate the user account ----
      await tx.teacher.update({
        where: { id: teacher.id },
        data: {
          registrationStatus: "APPROVED",
          isActive: opts?.makeActive ?? true,
        },
      });
      await tx.user.update({
        where: { id: teacher.userId },
        data: { isActive: true },
      });

      return { assignedArms, assignedSubjects };
      },
      { timeout: 30000, maxWait: 10000 }
    );

    return { teacherId: teacher.id, ...result };
  },

  /** Reject a pending registration — the teacher record/user stays but is deactivated. */
  reject: async (teacherId: string, note?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher || teacher.schoolId !== tenantId) {
      throw new Error("Teacher not found");
    }
    await prisma.teacher.update({
      where: { id: teacherId },
      data: { registrationStatus: "REJECTED", isActive: false },
    });
    await prisma.user.update({
      where: { id: teacher.userId },
      data: { isActive: false },
    });
    return { teacherId, note };
  },
};
