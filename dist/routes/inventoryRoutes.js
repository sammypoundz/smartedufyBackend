"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inventoryController_1 = require("../controllers/inventoryController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.authMiddleware);
// GET /api/inventory – list items (with filters & pagination)
router.get('/', inventoryController_1.inventoryController.getAll);
// GET /api/inventory/stats – stats
router.get('/stats', inventoryController_1.inventoryController.getStats);
// GET /api/inventory/:id – get one
router.get('/:id', inventoryController_1.inventoryController.getById);
// POST /api/inventory – create (admin/bursar only)
router.post('/', (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), inventoryController_1.inventoryController.create);
// PUT /api/inventory/:id – update (admin/bursar only)
router.put('/:id', (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), inventoryController_1.inventoryController.update);
// DELETE /api/inventory/:id – delete (admin/bursar only)
router.delete('/:id', (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR']), inventoryController_1.inventoryController.delete);
exports.default = router;
