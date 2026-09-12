import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { roleGuard } from "../middleware/roleGuard";
import { teacherRegistrationController } from "../controllers/teacherRegistrationController";

const router = Router();

// All admin-only: reviewing teacher self-registrations.
router.use(authMiddleware, roleGuard(["ADMIN", "PRINCIPAL"]));

// GET /api/teacher-registrations — list pending registrations
router.get("/", teacherRegistrationController.listPending);

// GET /api/teacher-registrations/count — sidebar badge count
router.get("/count", teacherRegistrationController.countPending);

// POST /api/teacher-registrations/:id/approve — approve + auto-assign
router.post("/:id/approve", teacherRegistrationController.approve);

// POST /api/teacher-registrations/:id/reject — reject
router.post("/:id/reject", teacherRegistrationController.reject);

export default router;
