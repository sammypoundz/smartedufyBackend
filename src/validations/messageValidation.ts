import { z } from 'zod';

// For sending a broadcast message
export const sendBroadcastMessageSchema = z.object({
  groups: z.array(z.enum(['all', 'admin', 'teacher', 'parent', 'student', 'staff'])).optional(),
  userIds: z.array(z.string()).optional(),
  type: z.enum(['email', 'sms']),
  subject: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
}).refine(data => (data.groups && data.groups.length > 0) || (data.userIds && data.userIds.length > 0), {
  message: 'At least one group or user must be selected',
});

// For fetching messages (inbox, sent, drafts) – we’ll add pagination later
export const getMessagesSchema = z.object({
  type: z.enum(['inbox', 'sent', 'drafts']).default('inbox'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// For getting a single message detail
export const getMessageSchema = z.object({
  id: z.string().uuid(),
});