import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';
import multer from 'multer';
import { staffController } from '../controllers/staffController';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// All routes require authentication and admin role
router.use(authMiddleware);
router.use(roleGuard(['ADMIN']));

router.get('/', staffController.getAll);
router.get('/:id', staffController.getById);
router.post('/', staffController.create);
router.put('/:id', staffController.update);
router.delete('/:id', staffController.delete);

router.post('/bulk', upload.single('file'), staffController.bulkUpload);
router.post('/generate-link', staffController.generateLink);

export default router;