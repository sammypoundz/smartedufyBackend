"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/questionDocRoutes.ts
// Teacher question-document submissions with admin review workflow.
// Teachers upload exam/question documents (PDF/DOC/DOCX/images) which sit in
// PENDING until an admin approves or rejects them (with feedback).
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const upload_1 = require("../middleware/upload");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
const ADMIN_ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"];
const isPrivileged = (user) => {
    const roles = [...(user?.roles || []), user?.role].filter(Boolean);
    return roles.some((r) => ADMIN_ROLES.includes(r));
};
/** Shared include: the uploading teacher's display info. */
const INCLUDE = {
    teacher: { select: { id: true, name: true, email: true } },
};
// ---------- TEACHER ENDPOINTS ----------
// GET /api/question-docs/mine — submissions of the logged-in teacher
router.get("/mine", async (req, res, next) => {
    try {
        const docs = await prisma_1.prisma.questionDoc.findMany({
            where: { schoolId: req.user.schoolId, teacherId: req.user.id },
            orderBy: { createdAt: "desc" },
            include: INCLUDE,
        });
        res.json(docs);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/question-docs — teacher uploads a question document (multipart)
router.post("/", (0, roleGuard_1.roleGuard)(["ADMIN", "TEACHER", "PRINCIPAL", "VICE_PRINCIPAL"]), upload_1.uploadQuestionDoc.single("file"), async (req, res, next) => {
    try {
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "File is required" });
        const { title, description, subjectName, className, armName, term } = req.body;
        if (!title || !String(title).trim()) {
            fs_1.default.unlink(file.path, () => { });
            return res.status(400).json({ error: "Title is required" });
        }
        const doc = await prisma_1.prisma.questionDoc.create({
            data: {
                schoolId: req.user.schoolId,
                teacherId: req.user.id,
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
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/question-docs/:id — owner edits (only PENDING for teachers)
router.put("/:id", (0, roleGuard_1.roleGuard)(["ADMIN", "TEACHER", "PRINCIPAL", "VICE_PRINCIPAL"]), upload_1.uploadQuestionDoc.single("file"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.questionDoc.findUnique({
            where: { id: String(req.params.id) },
        });
        if (!existing)
            return res.status(404).json({ error: "Submission not found" });
        if (existing.teacherId !== req.user.id && !isPrivileged(req.user)) {
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
        const data = {};
        if (title !== undefined)
            data.title = String(title).trim();
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
            if (existing.fileUrl)
                fs_1.default.unlink(existing.fileUrl, () => { });
            data.fileUrl = file.path;
            data.fileName = file.originalname;
            data.fileType = file.mimetype;
            data.fileSize = file.size;
        }
        const updated = await prisma_1.prisma.questionDoc.update({
            where: { id: String(req.params.id) },
            data,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/question-docs/:id — owner or admin
router.delete("/:id", async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.questionDoc.findUnique({
            where: { id: String(req.params.id) },
        });
        if (!existing)
            return res.status(404).json({ error: "Submission not found" });
        if (existing.teacherId !== req.user.id && !isPrivileged(req.user)) {
            return res.status(403).json({ error: "Not allowed" });
        }
        if (existing.fileUrl)
            fs_1.default.unlink(existing.fileUrl, () => { });
        await prisma_1.prisma.questionDoc.delete({ where: { id: String(req.params.id) } });
        res.json({ message: "Submission deleted" });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/question-docs/:id/download — owner, admins, or reviewers
router.get("/:id/download", async (req, res, next) => {
    try {
        const doc = await prisma_1.prisma.questionDoc.findUnique({
            where: { id: String(req.params.id) },
        });
        if (!doc)
            return res.status(404).json({ error: "Submission not found" });
        if (doc.teacherId !== req.user.id && !isPrivileged(req.user)) {
            return res.status(403).json({ error: "Not allowed" });
        }
        res.download(path_1.default.resolve(doc.fileUrl), doc.fileName);
    }
    catch (err) {
        next(err);
    }
});
// ---------- ADMIN ENDPOINTS ----------
// GET /api/question-docs?status=PENDING — all submissions (admins)
router.get("/", async (req, res, next) => {
    try {
        if (!isPrivileged(req.user)) {
            return res.status(403).json({ error: "Not allowed" });
        }
        const { status } = req.query;
        const where = { schoolId: req.user.schoolId };
        if (status &&
            ["PENDING", "APPROVED", "REJECTED"].includes(status.toUpperCase())) {
            where.status = status.toUpperCase();
        }
        const docs = await prisma_1.prisma.questionDoc.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: INCLUDE,
        });
        res.json(docs);
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/question-docs/:id/review — approve or reject (admins)
router.patch("/:id/review", (0, roleGuard_1.roleGuard)(["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"]), async (req, res, next) => {
    try {
        const { decision, reviewNote } = req.body;
        const d = String(decision || "").toUpperCase();
        if (!["APPROVED", "REJECTED"].includes(d)) {
            return res
                .status(400)
                .json({ error: "decision must be APPROVED or REJECTED" });
        }
        const existing = await prisma_1.prisma.questionDoc.findUnique({
            where: { id: String(req.params.id) },
        });
        if (!existing)
            return res.status(404).json({ error: "Submission not found" });
        if (existing.schoolId !== req.user.schoolId) {
            return res.status(403).json({ error: "Not allowed" });
        }
        const updated = await prisma_1.prisma.questionDoc.update({
            where: { id: String(req.params.id) },
            data: {
                status: d,
                reviewNote: reviewNote ? String(reviewNote).trim() : null,
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
            },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
