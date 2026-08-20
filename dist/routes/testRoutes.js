"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const testController_1 = require("../controllers/testController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
router.get('/', auth_1.authMiddleware, testController_1.testController.getAll);
router.get('/:id', auth_1.authMiddleware, testController_1.testController.getById);
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), testController_1.testController.create);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), testController_1.testController.update);
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), testController_1.testController.update); // for status toggles
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), testController_1.testController.delete);
exports.default = router;
