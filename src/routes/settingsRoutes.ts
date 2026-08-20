import { Router } from 'express';
import { settingsController } from '../controllers/settingsController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();
router.use(authMiddleware);

// General
router.get('/general', settingsController.getGeneral);
router.put('/general', roleGuard(['ADMIN']), settingsController.updateGeneral);

// Academic
router.get('/academic', settingsController.getAcademic);
router.put('/academic', roleGuard(['ADMIN']), settingsController.updateAcademic);

// Promotion Rules
router.get('/promotion-rules', settingsController.getPromotionRules);
router.post('/promotion-rules', roleGuard(['ADMIN']), settingsController.createPromotionRule);
router.put('/promotion-rules/:id', roleGuard(['ADMIN']), settingsController.updatePromotionRule);
router.delete('/promotion-rules/:id', roleGuard(['ADMIN']), settingsController.deletePromotionRule);

// Templates
router.get('/templates', settingsController.getTemplates);
router.post('/templates', roleGuard(['ADMIN']), settingsController.createTemplate);
router.put('/templates/:id', roleGuard(['ADMIN']), settingsController.updateTemplate);
router.delete('/templates/:id', roleGuard(['ADMIN']), settingsController.deleteTemplate);

// Bank Details
router.get('/bank', settingsController.getBankDetails);
router.put('/bank', roleGuard(['ADMIN', 'BURSAR']), settingsController.updateBankDetails);

// Notifications
router.get('/notifications', settingsController.getNotificationSettings);
router.put('/notifications', roleGuard(['ADMIN']), settingsController.updateNotificationSettings);

// Security
router.get('/security', settingsController.getSecuritySettings);
router.put('/security', roleGuard(['ADMIN']), settingsController.updateSecuritySettings);

// Backup
router.get('/backup', settingsController.getBackupSettings);
router.put('/backup', roleGuard(['ADMIN']), settingsController.updateBackupSettings);

export default router;