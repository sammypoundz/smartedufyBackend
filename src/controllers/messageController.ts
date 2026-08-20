import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { messageService } from '../services/messageService';
import {
  sendBroadcastMessageSchema,
  getMessagesSchema,
  getMessageSchema,
} from '../validations/messageValidation';

// Helper to get the authenticated user ID from the request
const getUserId = (req: AuthRequest): string => {
  if (!req.user) {
    throw new Error('Unauthorized – user not found');
  }
  return req.user.id;
};

export const messageController = {
  // Send a broadcast message to groups and/or individual users
  sendBroadcast: async (req: AuthRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const data = sendBroadcastMessageSchema.parse(req.body);
      const result = await messageService.sendBroadcast(userId, data);
      res.status(201).json(result);
    } catch (err: any) {
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
  getMessages: async (req: AuthRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const query = getMessagesSchema.parse(req.query);
      const result = await messageService.getMessages(userId, query);
      res.json(result);
    } catch (err: any) {
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
  getMessage: async (req: AuthRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const { id } = getMessageSchema.parse(req.params);

      // Fetch the message with sender details (including id)
      const message = await messageService.getMessage(id);

      // Authorisation: only sender or recipient can view
      const isSender = message.sender?.id === userId;
      const isRecipient = (message.recipients as any[]).some((r: any) => r.id === userId);

      if (!isSender && !isRecipient) {
        return res.status(403).json({
          error: 'Forbidden – you are not allowed to view this message',
        });
      }

      res.json(message);
    } catch (err: any) {
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