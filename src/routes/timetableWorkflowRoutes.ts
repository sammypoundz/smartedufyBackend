// src/routes/timetableWorkflowRoutes.ts
// Timetable workflow: (1) admin assigns subject+arm -> teacher with allowed
// days & periods per week, (2) teachers submit their available slots with
// conflict prevention, (3) admin reviews, requests changes or approves,
// (4) on approval the final timetable is compiled into TimetableEntry rows
// and locked. Existing timetable endpoints remain untouched.
import { Router } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { roleGuard } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

const ADMIN_ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const isPrivileged = (user: AuthRequest["user"]) => {
  const roles = [...(user?.roles || []), user?.role].filter(
    Boolean,
  ) as string[];
  return roles.some((r) => ADMIN_ROLES.includes(r));
};

/** Resolve the Teacher profile row for the logged-in user. */
const getTeacherProfile = async (req: AuthRequest) => {
  return prisma.teacher.findFirst({
    where: { schoolId: req.user!.schoolId, userId: req.user!.id },
  });
};

const INCLUDE = {
  subject: { select: { id: true, name: true } },
  arm: {
    select: {
      id: true,
      letter: true,
      alias: true,
      classId: true,
      class: { select: { id: true, name: true } },
    },
  },
  teacher: { select: { id: true, name: true, email: true } },
  slots: true,
};

/**
 * Conflict report for one arm:
 *  - class conflicts: same arm/day/slot covered by two different subjects
 *  - teacher conflicts: same teacher/day/slot in two different assignments
 *    (any arm) or in already-locked timetable entries
 *  - unmet requirements: submitted slots < periodsPerWeek
 */
const buildConflictReport = async (schoolId: string, armId: string) => {
  const assignments = await prisma.teacherSubjectAssignment.findMany({
    where: { schoolId, armId },
    include: { slots: true, subject: true, teacher: true },
  });

  const issues: {
    type: string;
    message: string;
    dayOfWeek?: string;
    timeSlot?: string;
  }[] = [];

  // Class conflicts within the arm + teacher conflicts across the school
  const bySlot = new Map<string, { subjectId: string; teacherId: string }[]>();
  for (const a of assignments) {
    for (const s of a.slots) {
      const key = `${s.dayOfWeek}|${s.timeSlot}`;
      const list = bySlot.get(key) || [];
      list.push({ subjectId: a.subjectId, teacherId: a.teacherId });
      bySlot.set(key, list);
    }
  }
  for (const [key, list] of bySlot) {
    const [day, slot] = key.split("|");
    const distinctSubjects = new Set(list.map((x) => x.subjectId));
    if (distinctSubjects.size > 1) {
      issues.push({
        type: "CLASS",
        dayOfWeek: day,
        timeSlot: slot,
        message: `The ${day} ${slot} period has ${distinctSubjects.size} different subjects assigned in this arm.`,
      });
    }
    const distinctTeachers = new Set(list.map((x) => x.teacherId));
    if (distinctTeachers.size > 1) {
      issues.push({
        type: "TEACHER",
        dayOfWeek: day,
        timeSlot: slot,
        message: `Two different teachers claim the ${day} ${slot} period in this arm.`,
      });
    }
  }

  // Teacher double-booking across ALL arms + against locked timetable entries
  const teacherIds = Array.from(new Set(assignments.map((a) => a.teacherId)));
  if (teacherIds.length) {
    const otherAssignments = await prisma.teacherSubjectAssignment.findMany({
      where: { schoolId, teacherId: { in: teacherIds }, armId: { not: armId } },
      include: {
        slots: true,
        arm: { include: { class: true } },
        subject: true,
        teacher: true,
      },
    });
    const ownSlotKeys = new Set<string>();
    for (const a of assignments)
      for (const s of a.slots)
        ownSlotKeys.add(`${a.teacherId}|${s.dayOfWeek}|${s.timeSlot}`);
    for (const a of otherAssignments) {
      for (const s of a.slots) {
        const key = `${a.teacherId}|${s.dayOfWeek}|${s.timeSlot}`;
        if (ownSlotKeys.has(key)) {
          issues.push({
            type: "TEACHER",
            dayOfWeek: s.dayOfWeek,
            timeSlot: s.timeSlot,
            message: `${a.teacher.name} is already booked ${s.dayOfWeek} ${s.timeSlot} for ${a.subject.name} (${a.arm.class.name} ${a.arm.letter}).`,
          });
        }
      }
    }
    const lockedEntries = await prisma.timetableEntry.findMany({
      where: {
        schoolId,
        linkedAssignmentId: { not: null },
        armId: { not: armId },
      },
      include: { arm: { include: { class: true } }, subject: true },
    });
    if (lockedEntries.length) {
      for (const e of lockedEntries) {
        if (!e.subjectId) continue;
        // Compare the teacher of this arm's matching subject assignment
        const teacherAssignment = assignments.find(
          (a) => a.subjectId === e.subjectId,
        );
        if (!teacherAssignment) continue;
        const key = `${teacherAssignment.teacherId}|${e.dayOfWeek}|${e.timeSlot}`;
        if (ownSlotKeys.has(key)) {
          issues.push({
            type: "TEACHER",
            dayOfWeek: e.dayOfWeek,
            timeSlot: e.timeSlot,
            message: `${e.dayOfWeek} ${e.timeSlot} is already locked in another arm's timetable for this teacher.`,
          });
        }
      }
    }
  }

  // Unmet period requirements
  for (const a of assignments) {
    if (a.slots.length < a.periodsPerWeek) {
      issues.push({
        type: "REQUIREMENT",
        message: `${a.teacher.name} — ${a.subject.name}: ${a.slots.length}/${a.periodsPerWeek} periods submitted.`,
      });
    }
  }
  return { assignments, issues };
};

// ---------- STEP 1: ADMIN — subject → teacher assignments ----------

// GET /api/timetable-workflow/assignments?armId= — all assignments (admin)
router.get(
  "/assignments",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const where: any = { schoolId: req.user!.schoolId };
      if (req.query.armId) where.armId = String(req.query.armId);
      const assignments = await prisma.teacherSubjectAssignment.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      res.json(assignments);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/timetable-workflow/assignments — create/upsert one assignment (admin)
router.post(
  "/assignments",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const { subjectId, armId, teacherId, allowedDays, periodsPerWeek } =
        req.body;
      if (!subjectId || !armId || !teacherId)
        return res
          .status(400)
          .json({ error: "subjectId, armId and teacherId are required" });
      const days = Array.isArray(allowedDays)
        ? allowedDays.filter((d: string) => DAYS.includes(d))
        : [];
      const periods = Math.max(1, Number(periodsPerWeek) || 1);

      const [subject, arm, teacher] = await Promise.all([
        prisma.subject.findFirst({
          where: { id: subjectId, schoolId: req.user!.schoolId },
        }),
        prisma.arm.findFirst({
          where: { id: armId, schoolId: req.user!.schoolId },
        }),
        prisma.teacher.findFirst({
          where: { id: teacherId, schoolId: req.user!.schoolId },
        }),
      ]);
      if (!subject || !arm || !teacher)
        return res
          .status(404)
          .json({ error: "Subject, arm or teacher not found in this school" });

      const assignment = await prisma.teacherSubjectAssignment.upsert({
        where: {
          schoolId_subjectId_armId: {
            schoolId: req.user!.schoolId,
            subjectId,
            armId,
          },
        },
        create: {
          schoolId: req.user!.schoolId,
          subjectId,
          armId,
          teacherId,
          allowedDays: days,
          periodsPerWeek: periods,
        },
        update: { teacherId, allowedDays: days, periodsPerWeek: periods },
        include: INCLUDE,
      });
      res.status(201).json(assignment);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/timetable-workflow/assignments/:id — edit assignment (admin)
router.patch(
  "/assignments/:id",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const existing = await prisma.teacherSubjectAssignment.findFirst({
        where: { id: String(req.params.id), schoolId: req.user!.schoolId },
      });
      if (!existing)
        return res.status(404).json({ error: "Assignment not found" });
      const { teacherId, allowedDays, periodsPerWeek } = req.body;
      const data: any = {};
      if (teacherId) {
        const teacher = await prisma.teacher.findFirst({
          where: { id: teacherId, schoolId: req.user!.schoolId },
        });
        if (!teacher)
          return res
            .status(404)
            .json({ error: "Teacher not found in this school" });
        data.teacherId = teacherId;
      }
      if (allowedDays !== undefined)
        data.allowedDays = Array.isArray(allowedDays)
          ? allowedDays.filter((d: string) => DAYS.includes(d))
          : [];
      if (periodsPerWeek !== undefined)
        data.periodsPerWeek = Math.max(1, Number(periodsPerWeek) || 1);
      const updated = await prisma.teacherSubjectAssignment.update({
        where: { id: existing.id },
        data,
        include: INCLUDE,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/timetable-workflow/assignments/:id (admin; cascades slots)
router.delete(
  "/assignments/:id",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const existing = await prisma.teacherSubjectAssignment.findFirst({
        where: { id: String(req.params.id), schoolId: req.user!.schoolId },
      });
      if (!existing)
        return res.status(404).json({ error: "Assignment not found" });
      await prisma.teacherSubjectAssignment.delete({
        where: { id: existing.id },
      });
      res.json({ message: "Assignment deleted" });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- STEP 2/3: TEACHER — view assignments & submit slots ----------

// GET /api/timetable-workflow/mine — the logged-in teacher's assignments
// with their submitted slots, review status of each arm, and the slots
// already occupied by their other assignments / locked timetables.
router.get("/mine", async (req: AuthRequest, res, next) => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) return res.json({ assignments: [], occupiedSlots: [] });

    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { schoolId: req.user!.schoolId, teacherId: teacher.id },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    // Slots the teacher already occupies elsewhere (their own prefs on other
    // assignments + locked timetable entries linking their assignments).
    const ownPrefs = await prisma.teacherSlotPreference.findMany({
      where: {
        schoolId: req.user!.schoolId,
        assignment: { teacherId: teacher.id },
      },
      include: { assignment: { select: { id: true } } },
    });
    const ownAssignmentIds = new Set(assignments.map((a) => a.id));
    const occupied = ownPrefs
      .filter((p) => !ownAssignmentIds.has(p.assignmentId))
      .map((p) => ({
        dayOfWeek: p.dayOfWeek,
        timeSlot: p.timeSlot,
        assignmentId: p.assignmentId,
      }));

    const armIds = Array.from(new Set(assignments.map((a) => a.armId)));
    const reviews = armIds.length
      ? await prisma.timetableReview.findMany({
          where: { schoolId: req.user!.schoolId, armId: { in: armIds } },
        })
      : [];

    res.json({ assignments, occupiedSlots: occupied, reviews });
  } catch (err) {
    next(err);
  }
});

// PUT /api/timetable-workflow/assignments/:id/slots — teacher submits slots
router.put("/assignments/:id/slots", async (req: AuthRequest, res, next) => {
  try {
    const { slots } = req.body as {
      slots: { dayOfWeek: string; timeSlot: string }[];
    };
    const assignment = await prisma.teacherSubjectAssignment.findFirst({
      where: { id: String(req.params.id), schoolId: req.user!.schoolId },
      include: { arm: { include: { class: true } }, subject: true },
    });
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const teacher = await getTeacherProfile(req);
    if (!teacher)
      return res.status(403).json({ error: "Only teachers can submit slots" });
    const admin = isPrivileged(req.user);
    if (assignment.teacherId !== teacher.id && !admin)
      return res
        .status(403)
        .json({ error: "You can only manage your own assignments" });

    // Locked arms are immutable
    const review = await prisma.timetableReview.findUnique({
      where: { armId: assignment.armId },
    });
    if (review?.status === "APPROVED")
      return res.status(400).json({
        error: "This timetable is locked — ask an admin to unlock it first",
      });

    const list = Array.isArray(slots) ? slots : [];
    const clean: { dayOfWeek: string; timeSlot: string }[] = [];
    const seen = new Set<string>();
    for (const s of list) {
      if (!s || !DAYS.includes(s.dayOfWeek) || !s.timeSlot) continue;
      if (
        assignment.allowedDays.length &&
        !assignment.allowedDays.includes(s.dayOfWeek)
      ) {
        return res.status(400).json({
          error: `${s.dayOfWeek} is not an allowed teaching day for this subject`,
        });
      }
      const key = `${s.dayOfWeek}|${s.timeSlot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ dayOfWeek: s.dayOfWeek, timeSlot: s.timeSlot });
    }
    if (clean.length > assignment.periodsPerWeek) {
      return res.status(400).json({
        error: `You can only pick ${assignment.periodsPerWeek} period(s) for this subject`,
      });
    }

    // Prevent double-picking slots the teacher already occupies on their
    // OTHER assignments (within this arm or any other).
    const ownPrefs = await prisma.teacherSlotPreference.findMany({
      where: {
        schoolId: req.user!.schoolId,
        assignment: { teacherId: teacher.id, id: { not: assignment.id } },
      },
    });
    for (const s of clean) {
      const clash = ownPrefs.find(
        (p) => p.dayOfWeek === s.dayOfWeek && p.timeSlot === s.timeSlot,
      );
      if (clash) {
        return res.status(409).json({
          error: `You already occupy ${s.dayOfWeek} ${s.timeSlot} in another assignment`,
        });
      }
    }

    // Prevent conflicts with already-locked (approved) timetables where the
    // same teacher teaches another arm.
    const lockedArmIds = (
      await prisma.timetableReview.findMany({
        where: { schoolId: req.user!.schoolId, status: "APPROVED" },
      })
    ).map((r) => r.armId);
    if (lockedArmIds.length) {
      const myOtherAssignments = await prisma.teacherSubjectAssignment.findMany(
        {
          where: {
            schoolId: req.user!.schoolId,
            teacherId: teacher.id,
            id: { not: assignment.id },
          },
          select: { subjectId: true },
        },
      );
      const subjectIds = myOtherAssignments.map((a) => a.subjectId);
      if (subjectIds.length) {
        const lockedEntries = await prisma.timetableEntry.findMany({
          where: {
            schoolId: req.user!.schoolId,
            armId: { in: lockedArmIds },
            subjectId: { in: subjectIds },
          },
        });
        for (const s of clean) {
          if (
            lockedEntries.some(
              (e) => e.dayOfWeek === s.dayOfWeek && e.timeSlot === s.timeSlot,
            )
          ) {
            return res.status(409).json({
              error: `${s.dayOfWeek} ${s.timeSlot} clashes with an already-approved timetable`,
            });
          }
        }
      }
    }

    await prisma.teacherSlotPreference.deleteMany({
      where: { assignmentId: assignment.id },
    });
    if (clean.length) {
      await prisma.teacherSlotPreference.createMany({
        data: clean.map((s) => ({
          schoolId: req.user!.schoolId,
          assignmentId: assignment.id,
          dayOfWeek: s.dayOfWeek,
          timeSlot: s.timeSlot,
        })),
      });
    }

    // Reflect submission in the review state of the arm. If the admin had
    // requested changes on THIS assignment, clear that flag; the arm only
    // returns to PENDING_REVIEW once no per-subject flags remain.
    const current = await prisma.timetableReview.findUnique({
      where: { armId: assignment.armId },
    });
    let flags: Record<string, string> = {};
    if (current?.requestedChanges) {
      try {
        flags = JSON.parse(current.requestedChanges);
      } catch {
        flags = {};
      }
    }
    delete flags[assignment.id];
    const hasFlags = Object.keys(flags).length > 0;
    await prisma.timetableReview.upsert({
      where: { armId: assignment.armId },
      create: {
        schoolId: req.user!.schoolId,
        armId: assignment.armId,
        status: "PENDING_REVIEW",
      },
      update: hasFlags
        ? { requestedChanges: JSON.stringify(flags) }
        : {
            status: "PENDING_REVIEW",
            requestedChanges: null,
            reviewNote: null,
          },
    });

    const updated = await prisma.teacherSubjectAssignment.findUnique({
      where: { id: assignment.id },
      include: INCLUDE,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---------- STEP 4/5/6: ADMIN — review, request changes, approve & lock ----------

// GET /api/timetable-workflow/arm/:armId — review board for one arm (admin)
router.get(
  "/arm/:armId",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const arm = await prisma.arm.findFirst({
        where: { id: String(req.params.armId), schoolId: req.user!.schoolId },
        include: { class: true },
      });
      if (!arm) return res.status(404).json({ error: "Arm not found" });
      const review = await prisma.timetableReview.findUnique({
        where: { armId: arm.id },
      });
      const { assignments, issues } = await buildConflictReport(
        req.user!.schoolId,
        arm.id,
      );
      res.json({ arm, review: review || null, assignments, issues });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/timetable-workflow/reviews — all arm review statuses (admin)
router.get(
  "/reviews",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const reviews = await prisma.timetableReview.findMany({
        where: { schoolId: req.user!.schoolId },
      });
      res.json(reviews);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/timetable-workflow/arm/:armId/request-changes — ask teachers to revise
router.post(
  "/arm/:armId/request-changes",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const { note } = req.body;
      if (!note || !String(note).trim())
        return res.status(400).json({
          error: "A note describing the requested changes is required",
        });
      const arm = await prisma.arm.findFirst({
        where: { id: String(req.params.armId), schoolId: req.user!.schoolId },
      });
      if (!arm) return res.status(404).json({ error: "Arm not found" });
      const review = await prisma.timetableReview.upsert({
        where: { armId: arm.id },
        create: {
          schoolId: req.user!.schoolId,
          armId: arm.id,
          status: "CHANGES_REQUESTED",
          reviewNote: String(note).trim(),
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
        update: {
          status: "CHANGES_REQUESTED",
          reviewNote: String(note).trim(),
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      res.json(review);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/timetable-workflow/assignments/:id/request-changes — ask ONE
// teacher to revise ONE subject's slots (per-assignment, not arm-wide).
// The note is stored in TimetableReview.requestedChanges as a JSON map of
// { assignmentId: note } so other subjects in the arm are unaffected.
router.post(
  "/assignments/:id/request-changes",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const { note } = req.body;
      if (!note || !String(note).trim())
        return res.status(400).json({
          error: "A note describing the requested changes is required",
        });
      const assignment = await prisma.teacherSubjectAssignment.findFirst({
        where: { id: String(req.params.id), schoolId: req.user!.schoolId },
        include: { subject: true, teacher: true },
      });
      if (!assignment)
        return res.status(404).json({ error: "Assignment not found" });
      const review = await prisma.timetableReview.findUnique({
        where: { armId: assignment.armId },
      });
      if (review?.status === "APPROVED")
        return res
          .status(400)
          .json({ error: "This timetable is locked — unlock it first" });
      let flags: Record<string, string> = {};
      if (review?.requestedChanges) {
        try {
          flags = JSON.parse(review.requestedChanges);
        } catch {
          flags = {};
        }
      }
      flags[assignment.id] = String(note).trim();
      const updated = await prisma.timetableReview.upsert({
        where: { armId: assignment.armId },
        create: {
          schoolId: req.user!.schoolId,
          armId: assignment.armId,
          status: "CHANGES_REQUESTED",
          requestedChanges: JSON.stringify(flags),
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
        update: {
          status: "CHANGES_REQUESTED",
          requestedChanges: JSON.stringify(flags),
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/timetable-workflow/arm/:armId/approve — validate conflicts, compile
// the final timetable into TimetableEntry rows and lock it.
router.post(
  "/arm/:armId/approve",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const arm = await prisma.arm.findFirst({
        where: { id: String(req.params.armId), schoolId: req.user!.schoolId },
        include: { class: true },
      });
      if (!arm) return res.status(404).json({ error: "Arm not found" });

      const { assignments, issues } = await buildConflictReport(
        req.user!.schoolId,
        arm.id,
      );
      const blocking = issues.filter((i) => i.type !== "REQUIREMENT");
      if (blocking.length)
        return res
          .status(409)
          .json({ error: "Conflicts detected", issues: blocking });

      if (issues.some((i) => i.type === "REQUIREMENT") && !req.body?.force) {
        return res.status(409).json({
          error: "Some subjects have fewer periods than required",
          issues,
        });
      }

      // Compile: replace this arm's timetable entries with the submitted slots
      const entries = assignments.flatMap((a) =>
        a.slots.map((s) => ({
          schoolId: req.user!.schoolId,
          armId: arm.id,
          dayOfWeek: s.dayOfWeek,
          timeSlot: s.timeSlot,
          subjectId: a.subjectId,
          linkedAssignmentId: a.id,
        })),
      );
      await prisma.$transaction([
        prisma.timetableEntry.deleteMany({
          where: { armId: arm.id, schoolId: req.user!.schoolId },
        }),
        ...(entries.length
          ? [prisma.timetableEntry.createMany({ data: entries })]
          : []),
        prisma.timetableReview.upsert({
          where: { armId: arm.id },
          create: {
            schoolId: req.user!.schoolId,
            armId: arm.id,
            status: "APPROVED",
            reviewNote: null,
            requestedChanges: null,
            reviewedBy: req.user!.id,
            reviewedAt: new Date(),
            lockedAt: new Date(),
          },
          update: {
            status: "APPROVED",
            reviewNote: null,
            requestedChanges: null,
            reviewedBy: req.user!.id,
            reviewedAt: new Date(),
            lockedAt: new Date(),
          },
        }),
      ]);
      res.json({
        message: "Timetable approved and locked",
        entries: entries.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/timetable-workflow/arm/:armId/unlock — reopen a locked arm (admin)
router.post(
  "/arm/:armId/unlock",
  roleGuard(ADMIN_ROLES),
  async (req: AuthRequest, res, next) => {
    try {
      const arm = await prisma.arm.findFirst({
        where: { id: String(req.params.armId), schoolId: req.user!.schoolId },
      });
      if (!arm) return res.status(404).json({ error: "Arm not found" });
      const review = await prisma.timetableReview.upsert({
        where: { armId: arm.id },
        create: {
          schoolId: req.user!.schoolId,
          armId: arm.id,
          status: "DRAFT",
        },
        update: { status: "DRAFT", lockedAt: null },
      });
      res.json(review);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
