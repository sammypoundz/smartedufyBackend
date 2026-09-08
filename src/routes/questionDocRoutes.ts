// src/routes/questionDocRoutes.ts
// Teacher question-document submissions with admin review workflow.
// Teachers upload exam/question documents (PDF/DOC/DOCX/images) which sit in
// PENDING until an admin approves or rejects them (with feedback).
import { Router } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { roleGuard } from "../middleware/roleGuard";
import { uploadQuestionDoc } from "../middleware/upload";
import fs from "fs";
import path from "path";

const router = Router();
router.use(authMiddleware);

const ADMIN_ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"];

const isPrivileged = (user: AuthRequest["user"]) => {
  const roles = [...(user?.roles || []), user?.role].filter(
    Boolean,
  ) as string[];
  return roles.some((r) => ADMIN_ROLES.includes(r));
};

/** Shared include: the uploading teacher's display info. */
const INCLUDE = {
  teacher: { select: { id: true, name: true, email: true } },
};

// ---------- TEACHER ENDPOINTS ----------

// GET /api/question-docs/mine — submissions of the logged-in teacher
router.get("/mine", async (req: AuthRequest, res, next) => {
  try {
    const docs = await prisma.questionDoc.findMany({
      where: { schoolId: req.user!.schoolId, teacherId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// POST /api/question-docs — teacher uploads a question document (multipart)
router.post(
  "/",
  roleGuard(["ADMIN", "TEACHER", "PRINCIPAL", "VICE_PRINCIPAL"]),
  uploadQuestionDoc.single("file"),
  async (req: AuthRequest, res, next) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "File is required" });

      const { title, description, subjectName, className, armName, term } = req.body;
      if (!title || !String(title).trim()) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({ error: "Title is required" });
      }

      const doc = await prisma.questionDoc.create({
        data: {
          schoolId: req.user!.schoolId,
          teacherId: req.user!.id,
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          subjectName: subjectName ? String(subjectName).trim() : null,
          className: className ? String(className).trim() : null,
          armName: armName ? String(armName).trim() : null,
          term: term ? String(term).trim() : null,
          fileUrl: file.path,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          status: "PENDING",
        },
      });
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/question-docs/:id — owner edits (only PENDING for teachers)
router.put(
  "/:id",
  roleGuard(["ADMIN", "TEACHER", "PRINCIPAL", "VICE_PRINCIPAL"]),
  uploadQuestionDoc.single("file"),
  async (req: AuthRequest, res, next) => {
    try {
      const existing = await prisma.questionDoc.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing)
        return res.status(404).json({ error: "Submission not found" });
      if (existing.teacherId !== req.user!.id && !isPrivileged(req.user)) {
        return res
          .status(403)
          .json({ error: "You can only edit your own submissions" });
      }
      if (existing.status !== "PENDING" && !isPrivileged(req.user)) {
        return res
          .status(400)
          .json({ error: "Only pending submissions can be edited" });
      }

      const { title, description, subjectName, className, armName, term } = req.body;
      const data: any = {};
      if (title !== undefined) data.title = String(title).trim();
      if (description !== undefined)
        data.description = String(description).trim() || null;
      if (subjectName !== undefined)
        data.subjectName = String(subjectName).trim() || null;
      if (className !== undefined)
        data.className = String(className).trim() || null;
      if (armName !== undefined)
        data.armName = String(armName).trim() || null;
      if (term !== undefined)
        data.term = String(term).trim() || null;

      const file = req.file;
      if (file) {
        if (existing.fileUrl) fs.unlink(existing.fileUrl, () => {});
        data.fileUrl = file.path;
        data.fileName = file.originalname;
        data.fileType = file.mimetype;
        data.fileSize = file.size;
      }

      const updated = await prisma.questionDoc.update({
        where: { id: String(req.params.id) },
        data,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/question-docs/:id — owner or admin
router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.questionDoc.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing)
      return res.status(404).json({ error: "Submission not found" });
    if (existing.teacherId !== req.user!.id && !isPrivileged(req.user)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    if (existing.fileUrl) fs.unlink(existing.fileUrl, () => {});
    await prisma.questionDoc.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Submission deleted" });
  } catch (err) {
    next(err);
  }
});

// GET /api/question-docs/:id/download — owner, admins, or reviewers
router.get("/:id/download", async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.questionDoc.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!doc) return res.status(404).json({ error: "Submission not found" });
    if (doc.teacherId !== req.user!.id && !isPrivileged(req.user)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    res.download(path.resolve(doc.fileUrl), doc.fileName);
  } catch (err) {
    next(err);
  }
});

// ---------- ADMIN ENDPOINTS ----------

// GET /api/question-docs?status=PENDING — all submissions (admins)
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    if (!isPrivileged(req.user)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    const { status } = req.query as Record<string, string>;
    const where: any = { schoolId: req.user!.schoolId };
    if (
      status &&
      ["PENDING", "APPROVED", "REJECTED"].includes(status.toUpperCase())
    ) {
      where.status = status.toUpperCase();
    }
    const docs = await prisma.questionDoc.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/question-docs/:id/review — approve or reject (admins)
router.patch(
  "/:id/review",
  roleGuard(["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"]),
  async (req: AuthRequest, res, next) => {
    try {
      const { decision, reviewNote } = req.body;
      const d = String(decision || "").toUpperCase();
      if (!["APPROVED", "REJECTED"].includes(d)) {
        return res
          .status(400)
          .json({ error: "decision must be APPROVED or REJECTED" });
      }
      const existing = await prisma.questionDoc.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing)
        return res.status(404).json({ error: "Submission not found" });
      if (existing.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ error: "Not allowed" });
      }

      const updated = await prisma.questionDoc.update({
        where: { id: String(req.params.id) },
        data: {
          status: d as any,
          reviewNote: reviewNote ? String(reviewNote).trim() : null,
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

export default router;
