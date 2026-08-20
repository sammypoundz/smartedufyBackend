"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageController = void 0;
const messageService_1 = require("../services/messageService");
const messageValidation_1 = require("../validations/messageValidation");
// Helper to get the authenticated user ID from the request
const getUserId = (req) => {
    if (!req.user) {
        throw new Error('Unauthorized – user not found');
    }
    return req.user.id;
};
exports.messageController = {
    // Send a broadcast message to groups and/or individual users
    sendBroadcast: async (req, res) => {
        try {
            const userId = getUserId(req);
            const data = messageValidation_1.sendBroadcastMessageSchema.parse(req.body);
            const result = await messageService_1.messageService.sendBroadcast(userId, data);
            res.status(201).json(result);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            // Handle "Unauthorized" thrown by getUserId
            if (err.message === 'Unauthorized – user not found') {
                return res.status(401).json({ error: err.message });
            }
            console.error('[sendBroadcast]', err);
            res.status(500).json({ error: 'Failed to send broadcast message' });
        }
    },
    // Get messages (inbox, sent, or drafts)
    getMessages: async (req, res) => {
        try {
            const userId = getUserId(req);
            const query = messageValidation_1.getMessagesSchema.parse(req.query);
            const result = await messageService_1.messageService.getMessages(userId, query);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.message === 'Unauthorized – user not found') {
                return res.status(401).json({ error: err.message });
            }
            console.error('[getMessages]', err);
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    },
    // Get a single message by ID
    getMessage: async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = messageValidation_1.getMessageSchema.parse(req.params);
            // Fetch the message with sender details (including id)
            const message = await messageService_1.messageService.getMessage(id);
            // Authorisation: only sender or recipient can view
            const isSender = message.sender?.id === userId;
            const isRecipient = message.recipients.some((r) => r.id === userId);
            if (!isSender && !isRecipient) {
                return res.status(403).json({
                    error: 'Forbidden – you are not allowed to view this message',
                });
            }
            res.json(message);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.message === 'Message not found') {
                return res.status(404).json({ error: err.message });
            }
            if (err.message === 'Unauthorized – user not found') {
                return res.status(401).json({ error: err.message });
            }
            console.error('[getMessage]', err);
            res.status(500).json({ error: 'Failed to fetch message' });
        }
    },
};
