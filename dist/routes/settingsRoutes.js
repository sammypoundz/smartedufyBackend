"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('settings'));
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
// ID Generator (config + preview; next-ID claiming happens during registration)
router.get('/id-generator', settingsController_1.settingsController.getIdGeneratorConfigs);
router.put('/id-generator', (0, roleGuard_1.roleGuard)(['ADMIN']), settingsController_1.settingsController.saveIdGeneratorConfig);
router.get('/id-generator/preview', settingsController_1.settingsController.previewNextId);
// Data integrity: audit & repair subject/teacher/class/student assignment links
router.post('/reconcile-data', (0, roleGuard_1.roleGuard)(['ADMIN']), async (req, res) => {
    try {
        const { syncService } = await Promise.resolve().then(() => __importStar(require('../services/syncService')));
        const report = await syncService.reconcileAll();
        res.json({ message: 'Data reconciliation complete', report });
    }
    catch (err) {
        console.error('Reconcile data error:', err);
        res.status(500).json({ error: err.message || 'Failed to reconcile data' });
    }
});
exports.default = router;
