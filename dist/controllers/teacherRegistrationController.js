"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherRegistrationController = void 0;
const teacherRegistrationService_1 = require("../services/teacherRegistrationService");
const auditService_1 = require("../services/auditService");
exports.teacherRegistrationController = {
    /** GET /teacher-registrations — list pending teacher registrations */
    listPending: async (req, res) => {
        try {
            const pending = await teacherRegistrationService_1.teacherRegistrationService.listPending();
            res.json({ pending });
        }
        catch (err) {
            console.error("List pending teacher registrations error:", err);
            res
                .status(500)
                .json({ error: err.message || "Failed to list pending registrations" });
        }
    },
    /** GET /teacher-registrations/count — badge count */
    countPending: async (_req, res) => {
        try {
            const count = await teacherRegistrationService_1.teacherRegistrationService.countPending();
            res.json({ count });
        }
        catch (err) {
            console.error("Count pending teacher registrations error:", err);
            res
                .status(500)
                .json({
                error: err.message || "Failed to count pending registrations",
            });
        }
    },
    /** POST /teacher-registrations/:id/approve — approve + auto-assign */
    approve: async (req, res) => {
        try {
            const id = String(req.params.id);
            const result = await teacherRegistrationService_1.teacherRegistrationService.approve(id);
            (0, auditService_1.logActivity)({
                schoolId: req.user?.schoolId,
                userId: req.user?.id,
                userName: req.user?.name,
                userEmail: req.user?.email,
                userRole: req.user?.role,
                action: "APPROVE_TEACHER_REGISTRATION",
                entity: "Teacher",
                entityId: id,
                description: `Approved teacher registration for ${result.teacherId}`,
                metadata: result,
            });
            res.json(result);
        }
        catch (err) {
            console.error("Approve teacher registration error:", err);
            const status = err.message === "Teacher not found" ? 404 : 500;
            res
                .status(status)
                .json({ error: err.message || "Failed to approve registration" });
        }
    },
    /** POST /teacher-registrations/:id/reject — reject */
    reject: async (req, res) => {
        try {
            const id = String(req.params.id);
            const note = typeof req.body?.note === "string" ? req.body.note : undefined;
            const result = await teacherRegistrationService_1.teacherRegistrationService.reject(id, note);
            (0, auditService_1.logActivity)({
                schoolId: req.user?.schoolId,
                userId: req.user?.id,
                userName: req.user?.name,
                userEmail: req.user?.email,
                userRole: req.user?.role,
                action: "REJECT_TEACHER_REGISTRATION",
                entity: "Teacher",
                entityId: id,
                description: `Rejected teacher registration for ${id}`,
            });
            res.json(result);
        }
        catch (err) {
            console.error("Reject teacher registration error:", err);
            const status = err.message === "Teacher not found" ? 404 : 500;
            res
                .status(status)
                .json({ error: err.message || "Failed to reject registration" });
        }
    },
};
