// POST /api/ai-scan/result-sheet — photo of a result sheet in, extracted marks out.
import { Router, Request, Response } from "express";
import multer from "multer";
import { extractResultSheet } from "../services/aiService";
import { authMiddleware } from "../middleware/auth";
import { privilegeGuard } from "../middleware/roleGuard";

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
    try {
      const file = (req as any).file;
      if (!file)
        return res
          .status(400)
          .json({ error: 'No image uploaded. Attach the photo as "image".' });

      const students = await extractResultSheet(file.buffer, file.mimetype);
      res.json({ students, count: students.length });
    } catch (err: any) {
      console.error("AI scan error:", err.message);
      res
        .status(err.status || 500)
        .json({ error: err.message || "Failed to scan result sheet" });
    }
  },
);

export default router;
