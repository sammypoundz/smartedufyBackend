"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payrollController_1 = require("../controllers/payrollController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Payroll is privilege-gated: any user holding the 'payroll' privilege (via
// their role or a direct grant) has full CRUD — ADMIN/PRINCIPAL implicitly pass.
router.use(auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('payroll'));
router.get('/', payrollController_1.payrollController.getAllPayroll);
router.get('/staff', payrollController_1.payrollController.getStaffForPayroll);
router.post('/', payrollController_1.payrollController.createPayroll);
router.put('/:id', payrollController_1.payrollController.updatePayroll);
router.delete('/:id', payrollController_1.payrollController.deletePayroll);
exports.default = router;
