"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const offlineService_1 = require("../services/offlineService");
const router = (0, express_1.Router)();
// ---------- GET /api/offline/bundle ----------
// The authenticated teacher's authorised offline data bundle. Uses the same
// authorisation rules as /arms/my-assignments + /arms/:id: form-teacher arms
// and arms where the teacher offers a subject. Admins get school-wide data.
router.get("/bundle", auth_1.authMiddleware, async (req, res) => {
    try {
        const bundle = await offlineService_1.offlineService.buildTeacherBundle(req.user.id, req.user.role);
        res.json(bundle);
    }
    catch (err) {
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
router.post("/sync", auth_1.authMiddleware, async (req, res) => {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
    if (ops.length === 0) {
        return res.json({ results: [] });
    }
    const results = [];
    for (const op of ops.slice(0, 200)) {
        try {
            const out = await offlineService_1.offlineService.applyOperation(op);
            results.push({
                opId: op.opId,
                status: "synced",
                id: out?.id,
            });
        }
        catch (err) {
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
exports.default = router;
