"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payrollController_1 = require("../controllers/payrollController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// All payroll endpoints require authentication and BURSAR/ADMIN role
router.get('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR', 'ACCOUNTANT']), payrollController_1.payrollController.getAllPayroll);
router.get('/staff', auth_1.authMiddleware, payrollController_1.payrollController.getStaffForPayroll);
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), payrollController_1.payrollController.createPayroll);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), payrollController_1.payrollController.updatePayroll);
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), payrollController_1.payrollController.deletePayroll);
exports.default = router;
