"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const multer_1 = __importDefault(require("multer"));
const staffController_1 = require("../controllers/staffController");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: 'uploads/' });
// All routes require authentication and admin role
router.use(auth_1.authMiddleware);
router.use((0, roleGuard_1.roleGuard)(['ADMIN']));
router.get('/', staffController_1.staffController.getAll);
router.get('/:id', staffController_1.staffController.getById);
router.post('/', staffController_1.staffController.create);
router.put('/:id', staffController_1.staffController.update);
router.delete('/:id', staffController_1.staffController.delete);
router.post('/bulk', upload.single('file'), staffController_1.staffController.bulkUpload);
router.post('/generate-link', staffController_1.staffController.generateLink);
exports.default = router;
