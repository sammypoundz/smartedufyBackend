import { Router } from 'express';
import { timetableController } from '../controllers/timetableController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// Roles allowed to create/modify/delete timetables. Teachers are deliberately
// excluded — they manage their slots through /timetable-workflow instead.
const TIMETABLE_ADMINS = ['ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL'];

// Get timetable for an arm (grouped by day)
router.get('/arm/:armId', authMiddleware, timetableController.getByArm);

// Bulk replace the entire timetable for an arm (admin only) – using PUT for idempotency
router.put('/arm/:armId', authMiddleware, roleGuard(TIMETABLE_ADMINS), timetableController.replace);

// Optional: keep POST for backward compatibility (or remove)
router.post('/arm/:armId', authMiddleware, roleGuard(TIMETABLE_ADMINS), timetableController.replace);

// Get timetable for a teacher (based on subjects they teach)
router.get('/teacher/:teacherId', authMiddleware, timetableController.getByTeacherId);

// Update a single timetable entry (admin only)
router.patch('/:id', authMiddleware, roleGuard(TIMETABLE_ADMINS), timetableController.update);

// Delete a single timetable entry (admin only)
router.delete('/:id', authMiddleware, roleGuard(TIMETABLE_ADMINS), timetableController.delete);

export default router;