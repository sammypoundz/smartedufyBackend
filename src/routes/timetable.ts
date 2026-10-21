import { Router } from 'express';
import { timetableController } from '../controllers/timetableController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// Write access: users holding the 'timetable' privilege. Role checks remain
// for workflows that bypass privileges (see also /timetable-workflow).
const canManageTimetable = [privilegeGuard('timetable')];

// Get timetable for an arm (grouped by day)
router.get('/arm/:armId', authMiddleware, timetableController.getByArm);

// Time slot layout for an arm (any authenticated user can read)
router.get('/arm/:armId/time-slots', authMiddleware, timetableController.getTimeSlots);

// Save the time slot layout for an arm (admin only) — recomputes the timetable
// so break/removed slots can never hold classes
router.put('/arm/:armId/time-slots', authMiddleware, ...canManageTimetable, timetableController.updateTimeSlots);

// Bulk replace the entire timetable for an arm (admin only) – using PUT for idempotency
router.put('/arm/:armId', authMiddleware, ...canManageTimetable, timetableController.replace);

// Optional: keep POST for backward compatibility (or remove)
router.post('/arm/:armId', authMiddleware, ...canManageTimetable, timetableController.replace);

// Get timetable for a teacher (based on subjects they teach)
router.get('/teacher/:teacherId', authMiddleware, timetableController.getByTeacherId);

// Update a single timetable entry (admin only)
router.patch('/:id', authMiddleware, ...canManageTimetable, timetableController.update);

// Delete a single timetable entry (admin only)
router.delete('/:id', authMiddleware, ...canManageTimetable, timetableController.delete);

export default router;