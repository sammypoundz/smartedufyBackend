"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// General
router.get('/general', settingsController_1.settingsController.getGeneral);
router.put('/general', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateGeneral);
// Academic
router.get('/academic', settingsController_1.settingsController.getAcademic);
router.put('/academic', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateAcademic);
// Promotion Rules
router.get('/promotion-rules', settingsController_1.settingsController.getPromotionRules);
router.post('/promotion-rules', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.createPromotionRule);
router.put('/promotion-rules/:id', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updatePromotionRule);
router.delete('/promotion-rules/:id', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.deletePromotionRule);
// Templates
router.get('/templates', settingsController_1.settingsController.getTemplates);
router.post('/templates', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.createTemplate);
router.put('/templates/:id', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateTemplate);
router.delete('/templates/:id', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.deleteTemplate);
// Bank Details
router.get('/bank', settingsController_1.settingsController.getBankDetails);
router.put('/bank', (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), settingsController_1.settingsController.updateBankDetails);
// Notifications
router.get('/notifications', settingsController_1.settingsController.getNotificationSettings);
router.put('/notifications', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateNotificationSettings);
// Security
router.get('/security', settingsController_1.settingsController.getSecuritySettings);
router.put('/security', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateSecuritySettings);
// Backup
router.get('/backup', settingsController_1.settingsController.getBackupSettings);
router.put('/backup', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.updateBackupSettings);
exports.default = router;
