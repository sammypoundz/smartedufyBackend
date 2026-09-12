// src/controllers/parentLinkController.ts
// Parent–Student linking workflow. Mirrors the Timetable workflow state
// vocabulary: PENDING_REVIEW | CHANGES_REQUESTED | APPROVED | REJECTED.
// A request only links the student to the parent's account once it is APPROVED.
import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth";
import { getStringParam } from "../utils/paramUtils";

/** Resolve the Parent record belonging to the logged-in user. */
async function resolveParent(req: AuthRequest) {
  const userId = req.user!.id;
  const email = req.user!.email;
  let parent = await prisma.parent.findFirst({ where: { userId } });
  if (!parent && email) {
    parent = await prisma.parent.findFirst({ where: { email } });
  }
  return parent;
}

const LINK_INCLUDE = {
  student: {
    select: {
      id: true,
      name: true,
      admissionNumber: true,
      class: { select: { name: true } },
      arm: { select: { letter: true } },
    },
  },
  parent: { select: { id: true, name: true, email: true } },
};

export const parentLinkController = {
  // ---------- PARENT SIDE ----------

  /** Search students by admission number and/or name (parent-facing). */
  searchStudents: async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json({ results: [] });
      const parent = await resolveParent(req);
      if (!parent)
        return res.status(404).json({ error: "Parent profile not found" });
      // Children linked to this parent (for duplicate-prevention hints)
      const myChildrenIds = new Set(
        (
          await prisma.student.findMany({
            where: { parentId: parent.id },
            select: { id: true },
          })
        ).map((c) => c.id),
      );

      /*
       * Prisma's `contains` is case-sensitive on MongoDB (and `mode:
       * 'insensitive'` isn't supported by the Mongo connector), so we fetch
       * the tenant-scoped students and filter case-insensitively in JS.
       */
      const candidates = await prisma.student.findMany({
        select: {
          id: true,
          name: true,
          admissionNumber: true,
          class: { select: { name: true } },
          arm: { select: { letter: true } },
        },
      });
      const needle = q.toLowerCase();
      const students = candidates
        .filter(
          (s) =>
            (s.name && s.name.toLowerCase().includes(needle)) ||
            (s.admissionNumber &&
              s.admissionNumber.toLowerCase().includes(needle)),
        )
        .slice(0, 15);

      // Duplicate prevention hints: flag students already linked to this parent
      // or already held by another parent, and those with an open request.
      const openRequests = await prisma.parentStudentLink.findMany({
        where: { status: "PENDING_REVIEW" },
        select: { studentId: true, parentId: true },
      });
      const openByStudent = new Map(
        openRequests.map((r) => [r.studentId, r.parentId]),
      );

      const results = students.map((s) => ({
        ...s,
        linkedToMe: myChildrenIds.has(s.id),
        alreadyHasParent: !!s.id && false, // parentId not selected; admin decides at approval
        hasOpenRequest: openByStudent.has(s.id),
        openRequestIsMine: openByStudent.get(s.id) === parent.id,
      }));
      res.json({ results });
    } catch (err) {
      console.error("Parent student search error:", err);
      res.status(500).json({ error: "Failed to search students" });
    }
  },

  /** The logged-in parent's link requests (for status badges on the dashboard). */
  myRequests: async (req: AuthRequest, res: Response) => {
    try {
      const parent = await resolveParent(req);
      if (!parent)
        return res.status(404).json({ error: "Parent profile not found" });
      const requests = await prisma.parentStudentLink.findMany({
        where: { parentId: parent.id },
        orderBy: { createdAt: "desc" },
        include: LINK_INCLUDE,
      });
      res.json({ requests });
    } catch (err) {
      console.error("Parent link requests error:", err);
      res.status(500).json({ error: "Failed to load link requests" });
    }
  },

  /** Submit a link request (duplicate-prevention enforced). */
  createRequest: async (req: AuthRequest, res: Response) => {
    try {
      const parent = await resolveParent(req);
      if (!parent)
        return res.status(404).json({ error: "Parent profile not found" });

      const studentId = String(req.body?.studentId || "");
      const parentNote = req.body?.note ? String(req.body.note) : null;
      if (!studentId)
        return res.status(400).json({ error: "studentId is required" });

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student) return res.status(404).json({ error: "Student not found" });

      // Duplicate prevention 1: already linked to this parent
      if (student.parentId === parent.id) {
        return res
          .status(409)
          .json({ error: `${student.name} is already linked to your account` });
      }
      // Duplicate prevention 2: already linked to another parent
      if (student.parentId) {
        return res.status(409).json({
          error: `${student.name} is already linked to another parent. Contact the school office.`,
        });
      }
      // Duplicate prevention 3: an open request for the same student+parent
      const existing = await prisma.parentStudentLink.findFirst({
        where: {
          studentId,
          parentId: parent.id,
          status: { in: ["PENDING_REVIEW"] },
        },
      });
      if (existing) {
        return res
          .status(409)
          .json({
            error: "A link request for this child is already awaiting review",
          });
      }

      const request = await prisma.parentStudentLink.create({
        data: {
          parentId: parent.id,
          studentId,
          requestedName: student.name,
          parentNote,
          schoolId: parent.schoolId,
          status: "PENDING_REVIEW" as const,
        },
        include: LINK_INCLUDE,
      });
      res.status(201).json({ request });
    } catch (err: any) {
      console.error("Create link request error:", err);
      res.status(500).json({ error: "Failed to submit link request" });
    }
  },

  // ---------- ADMIN SIDE ----------

  /** All link requests (Admin → Parents page). */
  listAll: async (req: Request, res: Response) => {
    try {
      const requests = await prisma.parentStudentLink.findMany({
        orderBy: { createdAt: "desc" },
        include: LINK_INCLUDE,
      });
      res.json({ requests });
    } catch (err) {
      console.error("List link requests error:", err);
      res.status(500).json({ error: "Failed to load link requests" });
    }
  },

  /** Approve: only now is the student actually linked to the parent. */
  approve: async (req: AuthRequest, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid id" });
      const request = await prisma.parentStudentLink.findUnique({
        where: { id },
        include: { student: true },
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (
        request.status !== "PENDING_REVIEW" &&
        request.status !== "CHANGES_REQUESTED"
      ) {
        return res
          .status(409)
          .json({ error: `Request already ${request.status}` });
      }
      const student = await prisma.student.findUnique({
        where: { id: request.studentId },
      });
      if (!student)
        return res.status(404).json({ error: "Student no longer exists" });
      if (student.parentId && student.parentId !== request.parentId) {
        await prisma.parentStudentLink.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewNote:
              "Student already linked to another parent before review",
            reviewedBy: req.user?.id,
            reviewedAt: new Date(),
          },
        });
        return res
          .status(409)
          .json({
            error:
              "Student already linked to another parent — request rejected",
          });
      }

      // Link + approve in one transaction
      await prisma.$transaction([
        prisma.student.update({
          where: { id: request.studentId },
          data: { parentId: request.parentId },
        }),
        prisma.parentStudentLink.update({
          where: { id },
          data: {
            status: "APPROVED",
            reviewNote: req.body?.note ? String(req.body.note) : null,
            reviewedBy: req.user?.id ?? null,
            reviewedAt: new Date(),
          },
        }),
      ]);
      const updated = await prisma.parentStudentLink.findUnique({
        where: { id },
        include: LINK_INCLUDE,
      });
      res.json({ request: updated });
    } catch (err) {
      console.error("Approve link request error:", err);
      res.status(500).json({ error: "Failed to approve link request" });
    }
  },

  /** Reject, or send back with changes requested. */
  reject: async (req: AuthRequest, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid id" });
      const action = String(req.body?.action || "REJECT").toUpperCase(); // REJECT | CHANGES_REQUESTED
      const note = req.body?.note ? String(req.body.note) : null;
      if (action === "CHANGES_REQUESTED" && !note) {
        return res
          .status(400)
          .json({ error: "A note is required when requesting changes" });
      }
      const request = await prisma.parentStudentLink.findUnique({
        where: { id },
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (
        request.status !== "PENDING_REVIEW" &&
        request.status !== "CHANGES_REQUESTED"
      ) {
        return res
          .status(409)
          .json({ error: `Request already ${request.status}` });
      }
      const updated = await prisma.parentStudentLink.update({
        where: { id },
        data: {
          status:
            action === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REJECTED",
          reviewNote: note,
          reviewedBy: req.user?.id ?? null,
          reviewedAt: new Date(),
        },
        include: LINK_INCLUDE,
      });
      res.json({ request: updated });
    } catch (err) {
      console.error("Reject link request error:", err);
      res.status(500).json({ error: "Failed to reject link request" });
    }
  },

  /** Attention flag for admin layouts — mirrors useTimetableWorkflowAttention. */
  pendingCount: async (req: Request, res: Response) => {
    try {
      const count = await prisma.parentStudentLink.count({
        where: { status: "PENDING_REVIEW" },
      });
      res.json({ count });
    } catch (err) {
      console.error("Pending count error:", err);
      res.status(500).json({ error: "Failed to count pending requests" });
    }
  },
};
