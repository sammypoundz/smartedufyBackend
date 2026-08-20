import { Router } from 'express';
import { inventoryController } from '../controllers/inventoryController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/inventory – list items (with filters & pagination)
router.get('/', inventoryController.getAll);

// GET /api/inventory/stats – stats
router.get('/stats', inventoryController.getStats);

// GET /api/inventory/:id – get one
router.get('/:id', inventoryController.getById);

// POST /api/inventory – create (admin/bursar only)
router.post(
  '/',
  roleGuard(['ADMIN', 'BURSAR']),
  inventoryController.create
);

// PUT /api/inventory/:id – update (admin/bursar only)
router.put(
  '/:id',
  roleGuard(['ADMIN', 'BURSAR']),
  inventoryController.update
);

// DELETE /api/inventory/:id – delete (admin/bursar only)
router.delete(
  '/:id',
  roleGuard(['ADMIN', 'BURSAR']),
  inventoryController.delete
);

export default router;