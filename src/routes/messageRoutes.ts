import { Router } from 'express';
import { messageController } from '../controllers/messageController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// 🔐 All routes require authentication
router.use(authMiddleware);

// 📤 Send a broadcast message – only admins, bursars, and teachers
router.post(
  '/broadcast',
  roleGuard(['ADMIN', 'BURSAR', 'TEACHER']),
  messageController.sendBroadcast
);

// 📥 Get messages (inbox, sent, or drafts) – any authenticated user
router.get('/', messageController.getMessages);

// 📄 Get a single message by ID – any authenticated user
router.get('/:id', messageController.getMessage);

export default router;