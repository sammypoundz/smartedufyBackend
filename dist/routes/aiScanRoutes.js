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
const aiUsageService_1 = require("../services/aiUsageService");
const tokenWalletService_1 = require("../services/tokenWalletService");
const tokenGate_1 = require("../services/tokenGate");
const platformSettingsService_1 = require("../services/platformSettingsService");
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
    const started = Date.now();
    const file = req.file;
    if (!file)
        return res
            .status(400)
            .json({ error: 'No image uploaded. Attach the photo as "image".' });
    const schoolId = req.user.schoolId;
    try {
        // ---- Token gating (Module 7) — 1 token per result-sheet scan ----
        const CHARGE = 1;
        const gate = await (0, tokenGate_1.gateTokens)(schoolId, CHARGE, "SCAN");
        let students;
        try {
            students = await (0, aiService_1.extractResultSheet)(file.buffer, file.mimetype);
        }
        catch (err) {
            // Release reserved tokens on failure
            await gate.release();
            await (0, aiUsageService_1.logAiUsage)({
                schoolId,
                userId: req.user.id,
                operation: "RESULT_SCAN",
                model: "gemini-flash",
                status: "FAILED",
                errorMessage: err.message,
                processingMs: Date.now() - started,
            });
            throw err;
        }
        // Charge reserved tokens after success
        const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
        await gate.charge();
        await (0, aiUsageService_1.logAiUsage)({
            schoolId,
            userId: req.user.id,
            operation: "RESULT_SCAN",
            model: "gemini-flash",
            status: "SUCCESS",
            processingMs: Date.now() - started,
            tokensCharged: CHARGE,
            revenueNgn: CHARGE * tokenPrice,
        });
        res.json({ students, count: students.length });
    }
    catch (err) {
        if (err instanceof tokenWalletService_1.InsufficientBalanceError) {
            return res.status(402).json({ error: err.message, required: err.required, balance: err.available });
        }
        console.error("AI scan error:", err.message);
        res
            .status(err.status || 500)
            .json({ error: err.message || "Failed to scan result sheet" });
    }
});
exports.default = router;
