// POST /api/ai-scan/result-sheet — photo of a result sheet in, extracted marks out.
import { Router, Request, Response } from "express";
import multer from "multer";
import { extractResultSheet } from "../services/aiService";
import { authMiddleware } from "../middleware/auth";
import { privilegeGuard } from "../middleware/roleGuard";
import { logAiUsage } from "../services/aiUsageService";
import { tokenWalletService, InsufficientBalanceError } from "../services/tokenWalletService";
import { getTokenPrice } from "../services/platformSettingsService";
import { notifyPlatform } from "../services/platformNotificationService";
import { prisma } from "../config/prisma";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
      cb(null, true);
    else
      cb(new Error("Invalid file type. Only JPG, PNG or WEBP images allowed."));
  },
});

router.post(
  "/result-sheet",
  authMiddleware,
  privilegeGuard("results"),
  upload.single("image"),
  async (req: Request, res: Response) => {
    const started = Date.now();
    const file = (req as any).file;
    if (!file)
      return res
        .status(400)
        .json({ error: 'No image uploaded. Attach the photo as "image".' });

    const schoolId = req.user!.schoolId;

    try {
      // ---- Token gating (Module 7) ----
      const wallet = await tokenWalletService.getWallet(schoolId);
      const CHARGE = 1; // 1 token per result-sheet scan
      if (wallet.balance < CHARGE) {
        await notifyPlatform({
          type: "LOW_BALANCE",
          title: "Low token balance",
          message: `A scan was blocked at ${schoolId}: balance ${wallet.balance}, need ${CHARGE}.`,
          schoolId,
          severity: "WARNING",
        });
        return res.status(402).json({
          error: "Insufficient token balance",
          required: CHARGE,
          balance: wallet.balance,
        });
      }

      const ref = `SCAN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await tokenWalletService.reserve(schoolId, CHARGE, ref);

      let students: any[];
      let model = "unknown";
      let aiCostNgn = 0;
      try {
        students = await extractResultSheet(file.buffer, file.mimetype);
      } catch (err: any) {
        // Release reserved tokens on failure
        await tokenWalletService.release(schoolId, CHARGE, ref);
        await logAiUsage({
          schoolId,
          userId: req.user!.id,
          operation: "RESULT_SCAN",
          model: "gemini-flash",
          status: "FAILED",
          errorMessage: err.message,
          processingMs: Date.now() - started,
        });
        throw err;
      }

      // Charge reserved tokens after success
      const tokenPrice = await getTokenPrice();
      await tokenWalletService.charge(schoolId, CHARGE, ref);
      await logAiUsage({
        schoolId,
        userId: req.user!.id,
        operation: "RESULT_SCAN",
        model: "gemini-flash",
        status: "SUCCESS",
        processingMs: Date.now() - started,
        tokensCharged: CHARGE,
        revenueNgn: CHARGE * tokenPrice,
      });

      res.json({ students, count: students.length });
    } catch (err: any) {
      if (err instanceof InsufficientBalanceError) {
        return res.status(402).json({ error: err.message, required: err.required, balance: err.available });
      }
      console.error("AI scan error:", err.message);
      res
        .status(err.status || 500)
        .json({ error: err.message || "Failed to scan result sheet" });
    }
  },
);

export default router;
