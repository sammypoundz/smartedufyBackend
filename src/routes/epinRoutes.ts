// Result Checker e-Pin routes
//   Admin (authenticated, tenant-scoped):
//     POST /api/epins/generate        — generate pins for an arm/term/year
//     GET  /api/epins?armId=&yearId=&term= — list pins for export
//   Public (no auth):
//     POST /api/epins/check           — redeem serial+pin, returns term results
import { Router } from "express";
import { epinService } from "../services/epinService";
import { privilegeGuard } from "../middleware/roleGuard";
import { authMiddleware } from "../middleware/auth";
import { runWithTenant } from "../utils/tenantContext";

const router = Router();

/** Handler wrapper that maps service status-carrying errors to HTTP codes. */
function sendError(res: any, err: any) {
  const status = typeof err?.status === "number" ? err.status : 500;
  return res
    .status(status)
    .json({ error: err?.message || "e-Pin operation failed" });
}

// ---------- PUBLIC: check results with a serial + pin ----------
// Registered before auth-protected routes; no middleware on this one.
router.post("/check", async (req, res) => {
  try {
    const { serial, pin } = req.body || {};
    if (!serial || !pin) {
      return res
        .status(400)
        .json({ error: "Serial number and PIN are required" });
    }
    const data = await epinService.checkResults({ serial, pin });
    res.json(data);
  } catch (err: any) {
    sendError(res, err);
  }
});

// ---------- ADMIN ----------
router.use(authMiddleware);

// Generate pins for an arm for a term of an academic year
router.post("/generate", privilegeGuard("results"), async (req: any, res) => {
  try {
    const { armId, academicYearId, term, maxUses, expiresInDays } =
      req.body || {};
    if (!armId || !academicYearId || !term) {
      return res
        .status(400)
        .json({ error: "armId, academicYearId and term are required" });
    }
    const result = await runWithTenant(req.user.schoolId, async () =>
      epinService.generateForArm({
        armId,
        academicYearId,
        term,
        maxUses,
        expiresInDays,
      }),
    );
    res.json(await result);
  } catch (err: any) {
    sendError(res, err);
  }
});

// List pins (for the admin table / Excel export)
router.get("/", privilegeGuard("results"), async (req: any, res) => {
  try {
    const { armId, academicYearId, term } = req.query as Record<string, string>;
    if (!armId || !academicYearId || !term) {
      return res
        .status(400)
        .json({
          error: "armId, academicYearId and term query params are required",
        });
    }
    const pins = await runWithTenant(req.user.schoolId, async () =>
      epinService.listForArm({ armId, academicYearId, term }),
    );
    res.json(await pins);
  } catch (err: any) {
    sendError(res, err);
  }
});

export default router;
