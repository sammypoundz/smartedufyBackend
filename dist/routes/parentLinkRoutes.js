"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/parentLinkRoutes.ts
const express_1 = require("express");
const parentLinkController_1 = require("../controllers/parentLinkController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ---------- Parent-facing ----------
router.get("/search", auth_1.authMiddleware, (0, auth_1.roleGuard)(["PARENT", "ADMIN"]), parentLinkController_1.parentLinkController.searchStudents);
router.get("/mine", auth_1.authMiddleware, (0, auth_1.roleGuard)(["PARENT", "ADMIN"]), parentLinkController_1.parentLinkController.myRequests);
router.post("/requests", auth_1.authMiddleware, (0, auth_1.roleGuard)(["PARENT"]), parentLinkController_1.parentLinkController.createRequest);
// ---------- Admin-facing (handled on Admin → Parents page) ----------
router.get("/requests", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), parentLinkController_1.parentLinkController.listAll);
router.post("/requests/:id/approve", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), parentLinkController_1.parentLinkController.approve);
router.post("/requests/:id/reject", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL"]), parentLinkController_1.parentLinkController.reject);
router.get("/pending-count", auth_1.authMiddleware, (0, auth_1.roleGuard)(["ADMIN", "PRINCIPAL", "PARENT"]), parentLinkController_1.parentLinkController.pendingCount);
exports.default = router;
