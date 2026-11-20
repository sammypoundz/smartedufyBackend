import { Router } from 'express';
import { libraryController } from '../controllers/libraryController';
import { authMiddleware } from '../middleware/auth';
import { privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication; the whole library surface requires the
// 'library' privilege (ADMIN/PRINCIPAL pass implicitly, LIBRARIAN holds it
// by default via SYSTEM_ROLE_PRIVILEGES).
router.use(authMiddleware);
router.use(privilegeGuard('library'));

// ---------- Dashboard ----------
router.get('/stats', libraryController.getStats);

// ---------- Books ----------
router.get('/books', libraryController.getBooks);
router.post('/books', libraryController.createBook);
router.put('/books/:id', libraryController.updateBook);
router.delete('/books/:id', libraryController.deleteBook);

// ---------- Lending ----------
router.get('/loans', libraryController.getLoans);
router.post('/loans', libraryController.issueBook);
router.put('/loans/:id/return', libraryController.returnBook);

// ---------- Book fees ----------
router.get('/book-fees', libraryController.getBookFees);
router.post('/book-fees/assign', libraryController.assignBookFeeToClass);
router.put('/book-fees/:id', libraryController.setBookFeePaid);
router.post('/book-fees/push-to-school-fees', libraryController.pushBookFeesToSchoolFees);

export default router;
