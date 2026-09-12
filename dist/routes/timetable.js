"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const timetableController_1 = require("../controllers/timetableController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Roles allowed to create/modify/delete timetables. Teachers are deliberately
// excluded — they manage their slots through /timetable-workflow instead.
const TIMETABLE_ADMINS = ['ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL'];
// Get timetable for an arm (grouped by day)
router.get('/arm/:armId', auth_1.authMiddleware, timetableController_1.timetableController.getByArm);
// Time slot layout for an arm (any authenticated user can read)
router.get('/arm/:armId/time-slots', auth_1.authMiddleware, timetableController_1.timetableController.getTimeSlots);
// Save the time slot layout for an arm (admin only) — recomputes the timetable
// so break/removed slots can never hold classes
router.put('/arm/:armId/time-slots', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(TIMETABLE_ADMINS), timetableController_1.timetableController.updateTimeSlots);
// Bulk replace the entire timetable for an arm (admin only) – using PUT for idempotency
router.put('/arm/:armId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(TIMETABLE_ADMINS), timetableController_1.timetableController.replace);
// Optional: keep POST for backward compatibility (or remove)
router.post('/arm/:armId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(TIMETABLE_ADMINS), timetableController_1.timetableController.replace);
// Get timetable for a teacher (based on subjects they teach)
router.get('/teacher/:teacherId', auth_1.authMiddleware, timetableController_1.timetableController.getByTeacherId);
// Update a single timetable entry (admin only)
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(TIMETABLE_ADMINS), timetableController_1.timetableController.update);
// Delete a single timetable entry (admin only)
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(TIMETABLE_ADMINS), timetableController_1.timetableController.delete);
exports.default = router;
