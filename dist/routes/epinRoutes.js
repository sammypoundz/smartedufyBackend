"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Result Checker e-Pin routes
//   Admin (authenticated, tenant-scoped):
//     POST /api/epins/generate        — generate pins for an arm/term/year
//     GET  /api/epins?armId=&yearId=&term= — list pins for export
//   Public (no auth):
//     POST /api/epins/check           — redeem serial+pin, returns term results
const express_1 = require("express");
const epinService_1 = require("../services/epinService");
const roleGuard_1 = require("../middleware/roleGuard");
const auth_1 = require("../middleware/auth");
const tenantContext_1 = require("../utils/tenantContext");
const router = (0, express_1.Router)();
/** Handler wrapper that maps service status-carrying errors to HTTP codes. */
function sendError(res, err) {
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
        const data = await epinService_1.epinService.checkResults({ serial, pin });
        res.json(data);
    }
    catch (err) {
        sendError(res, err);
    }
});
// ---------- ADMIN ----------
router.use(auth_1.authMiddleware);
// Generate pins for an arm for a term of an academic year
router.post("/generate", (0, roleGuard_1.privilegeGuard)("results"), async (req, res) => {
    try {
        const { armId, academicYearId, term, maxUses, expiresInDays } = req.body || {};
        if (!armId || !academicYearId || !term) {
            return res
                .status(400)
                .json({ error: "armId, academicYearId and term are required" });
        }
        const result = await (0, tenantContext_1.runWithTenant)(req.user.schoolId, async () => epinService_1.epinService.generateForArm({
            armId,
            academicYearId,
            term,
            maxUses,
            expiresInDays,
        }));
        res.json(await result);
    }
    catch (err) {
        sendError(res, err);
    }
});
// List pins (for the admin table / Excel export)
router.get("/", (0, roleGuard_1.privilegeGuard)("results"), async (req, res) => {
    try {
        const { armId, academicYearId, term } = req.query;
        if (!armId || !academicYearId || !term) {
            return res
                .status(400)
                .json({
                error: "armId, academicYearId and term query params are required",
            });
        }
        const pins = await (0, tenantContext_1.runWithTenant)(req.user.schoolId, async () => epinService_1.epinService.listForArm({ armId, academicYearId, term }));
        res.json(await pins);
    }
    catch (err) {
        sendError(res, err);
    }
});
exports.default = router;
