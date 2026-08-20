"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../controllers/attendanceController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
/**
 * GET /api/attendance/student/:studentId
 * Returns all attendance records for a specific student:
 * [{ date: string, present: boolean }]
 */
router.get('/student/:studentId', auth_1.authMiddleware, attendanceController_1.attendanceController.getByStudentId);
/**
 * GET /api/attendance/arm/:armId
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 * Returns flat list of attendance records:
 * [{ studentId: string, date: string, present: boolean }]
 */
router.get('/arm/:armId', auth_1.authMiddleware, attendanceController_1.attendanceController.getByArm);
/**
 * POST /api/attendance/arm/:armId
 * Body: { date: string, records: [{ studentId: string, present: boolean }] }
 * Saves/updates attendance for the given date.
 */
router.post('/arm/:armId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), attendanceController_1.attendanceController.saveAttendance);
/**
 * Legacy endpoint – kept for backward compatibility
 * POST /api/attendance/mark
 * Body: { date: string, records: [{ studentId: string, present: boolean }] }
 */
router.post('/mark', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), attendanceController_1.attendanceController.mark);
exports.default = router;
