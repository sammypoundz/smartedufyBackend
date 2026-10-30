"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feeController_1 = require("../controllers/feeController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Fee Structures
router.get('/structures', auth_1.authMiddleware, feeController_1.feeController.getAllFeeStructures);
router.post('/structures', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.createFeeStructure);
router.put('/structures/:id', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.updateFeeStructure);
router.delete('/structures/:id', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.deleteFeeStructure);
// Payments
router.get('/payments', auth_1.authMiddleware, feeController_1.feeController.getAllPayments);
router.post('/payments', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.recordPayment);
router.put('/payments/:id', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.updatePayment);
router.delete('/payments/:id', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees'), feeController_1.feeController.deletePayment);
// Student assigned fees (NEW)
router.get('/students/:studentId/assigned-fees', auth_1.authMiddleware, feeController_1.feeController.getStudentAssignedFees);
// Messages (email / SMS)
router.post('/messages', auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('fees', 'messaging'), feeController_1.feeController.sendMessage);
exports.default = router;
