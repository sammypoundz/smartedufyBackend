"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messageController_1 = require("../controllers/messageController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// 🔐 All routes require authentication
router.use(auth_1.authMiddleware);
// 📤 Send a broadcast message – only admins, bursars, and teachers
router.post('/broadcast', (0, roleGuard_1.roleGuard)(['ADMIN', 'BURSAR', 'TEACHER']), messageController_1.messageController.sendBroadcast);
// 📥 Get messages (inbox, sent, or drafts) – any authenticated user
router.get('/', messageController_1.messageController.getMessages);
// 📄 Get a single message by ID – any authenticated user
router.get('/:id', messageController_1.messageController.getMessage);
exports.default = router;
