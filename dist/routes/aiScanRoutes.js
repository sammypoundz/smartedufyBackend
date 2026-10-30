"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// POST /api/ai-scan/result-sheet — photo of a result sheet in, extracted marks out.
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const aiService_1 = require("../services/aiService");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error("Invalid file type. Only JPG, PNG or WEBP images allowed."));
    },
});
router.post("/result-sheet", auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)("results"), upload.single("image"), async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            return res
                .status(400)
                .json({ error: 'No image uploaded. Attach the photo as "image".' });
        const students = await (0, aiService_1.extractResultSheet)(file.buffer, file.mimetype);
        res.json({ students, count: students.length });
    }
    catch (err) {
        console.error("AI scan error:", err.message);
        res
            .status(err.status || 500)
            .json({ error: err.message || "Failed to scan result sheet" });
    }
});
exports.default = router;
