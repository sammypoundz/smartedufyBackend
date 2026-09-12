// backend/src/controllers/teacherRegistrationController.ts
// Admin-side endpoints for reviewing teacher self-registrations.
import { Request, Response } from "express";
import { teacherRegistrationService } from "../services/teacherRegistrationService";
import { logActivity } from "../services/auditService";

export const teacherRegistrationController = {
  /** GET /teacher-registrations — list pending teacher registrations */
  listPending: async (req: Request, res: Response) => {
    try {
      const pending = await teacherRegistrationService.listPending();
      res.json({ pending });
    } catch (err: any) {
      console.error("List pending teacher registrations error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to list pending registrations" });
    }
  },

  /** GET /teacher-registrations/count — badge count */
  countPending: async (_req: Request, res: Response) => {
    try {
      const count = await teacherRegistrationService.countPending();
      res.json({ count });
    } catch (err: any) {
      console.error("Count pending teacher registrations error:", err);
      res
        .status(500)
        .json({
          error: err.message || "Failed to count pending registrations",
        });
    }
  },

  /** POST /teacher-registrations/:id/approve — approve + auto-assign */
  approve: async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = await teacherRegistrationService.approve(id);
      logActivity({
        schoolId: (req as any).user?.schoolId,
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        userEmail: (req as any).user?.email,
        userRole: (req as any).user?.role,
        action: "APPROVE_TEACHER_REGISTRATION",
        entity: "Teacher",
        entityId: id,
        description: `Approved teacher registration for ${result.teacherId}`,
        metadata: result,
      });
      res.json(result);
    } catch (err: any) {
      console.error("Approve teacher registration error:", err);
      const status = err.message === "Teacher not found" ? 404 : 500;
      res
        .status(status)
        .json({ error: err.message || "Failed to approve registration" });
    }
  },

  /** POST /teacher-registrations/:id/reject — reject */
  reject: async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = String(req.params.id);
      const note =
        typeof req.body?.note === "string" ? req.body.note : undefined;
      const result = await teacherRegistrationService.reject(
        id,
        note,
      );
      logActivity({
        schoolId: (req as any).user?.schoolId,
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        userEmail: (req as any).user?.email,
        userRole: (req as any).user?.role,
        action: "REJECT_TEACHER_REGISTRATION",
        entity: "Teacher",
        entityId: id,
        description: `Rejected teacher registration for ${id}`,
      });
      res.json(result);
    } catch (err: any) {
      console.error("Reject teacher registration error:", err);
      const status = err.message === "Teacher not found" ? 404 : 500;
      res
        .status(status)
        .json({ error: err.message || "Failed to reject registration" });
    }
  },
};
