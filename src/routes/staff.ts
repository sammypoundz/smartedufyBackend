import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';
import multer from 'multer';
import { staffController } from '../controllers/staffController';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// All routes require authentication; the whole router is gated on the 'staff'
// privilege so granted users get full CRUD (ADMIN/PRINCIPAL implicitly pass).
router.use(authMiddleware);
router.use(privilegeGuard('staff', 'teachers'));

router.get('/', staffController.getAll);
router.get('/:id', staffController.getById);
router.post('/', staffController.create);
router.put('/:id', staffController.update);
router.delete('/:id', staffController.delete);

router.post('/bulk', upload.single('file'), staffController.bulkUpload);
router.post('/generate-link', staffController.generateLink);

export default router;