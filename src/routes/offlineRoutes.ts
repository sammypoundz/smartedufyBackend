import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { offlineService } from "../services/offlineService";

const router = Router();

// ---------- GET /api/offline/bundle ----------
// The authenticated teacher's authorised offline data bundle. Uses the same
// authorisation rules as /arms/my-assignments + /arms/:id: form-teacher arms
// and arms where the teacher offers a subject. Admins get school-wide data.
router.get("/bundle", authMiddleware, async (req: any, res) => {
  try {
    const bundle = await offlineService.buildTeacherBundle(
      req.user.id,
      req.user.role,
    );
    res.json(bundle);
  } catch (err: any) {
    console.error("Offline bundle error:", err);
    if (err.message === "Teacher profile not found") {
      return res.status(403).json({ error: "Teacher profile not found" });
    }
    res.status(500).json({ error: "Failed to build offline bundle" });
  }
});

// ---------- POST /api/offline/sync ----------
// Replay a batch of queued offline operations. Each op is validated with the
// existing services (tenant checks, role guards already applied at route
// level via authMiddleware + controller validation inside the services).
router.post("/sync", authMiddleware, async (req: any, res) => {
  const ops: Array<{ opId: string; type: string; payload: any }> =
    Array.isArray(req.body?.ops) ? req.body.ops : [];

  if (ops.length === 0) {
    return res.json({ results: [] });
  }

  const results: Array<{
    opId: string;
    status: "synced" | "failed";
    error?: string;
    id?: string;
  }> = [];

  for (const op of ops.slice(0, 200)) {
    try {
      const out = await offlineService.applyOperation(op);
      results.push({
        opId: op.opId,
        status: "synced",
        id: out?.id,
      });
    } catch (err: any) {
      // Re-auth is implicit (authMiddleware ran); permission/validity failures
      // surface as 'failed' so the client can retry or discard accordingly.
      results.push({
        opId: op.opId,
        status: "failed",
        error: err.message || "Operation failed",
      });
    }
  }

  res.json({ results });
});

export default router;
