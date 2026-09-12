// src/routes/parentLinkRoutes.ts
import { Router } from "express";
import { parentLinkController } from "../controllers/parentLinkController";
import { authMiddleware, roleGuard } from "../middleware/auth";

const router = Router();

// ---------- Parent-facing ----------
router.get(
  "/search",
  authMiddleware,
  roleGuard(["PARENT", "ADMIN"]),
  parentLinkController.searchStudents,
);
router.get(
  "/mine",
  authMiddleware,
  roleGuard(["PARENT", "ADMIN"]),
  parentLinkController.myRequests,
);
router.post(
  "/requests",
  authMiddleware,
  roleGuard(["PARENT"]),
  parentLinkController.createRequest,
);

// ---------- Admin-facing (handled on Admin → Parents page) ----------
router.get(
  "/requests",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL"]),
  parentLinkController.listAll,
);
router.post(
  "/requests/:id/approve",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL"]),
  parentLinkController.approve,
);
router.post(
  "/requests/:id/reject",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL"]),
  parentLinkController.reject,
);
router.get(
  "/pending-count",
  authMiddleware,
  roleGuard(["ADMIN", "PRINCIPAL", "PARENT"]),
  parentLinkController.pendingCount,
);

export default router;
