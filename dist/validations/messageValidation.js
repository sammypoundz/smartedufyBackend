"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageSchema = exports.getMessagesSchema = exports.sendBroadcastMessageSchema = void 0;
const zod_1 = require("zod");
// For sending a broadcast message
exports.sendBroadcastMessageSchema = zod_1.z.object({
    groups: zod_1.z.array(zod_1.z.enum(['all', 'admin', 'teacher', 'parent', 'student', 'staff'])).optional(),
    userIds: zod_1.z.array(zod_1.z.string()).optional(),
    type: zod_1.z.enum(['email', 'sms']),
    subject: zod_1.z.string().optional(),
    message: zod_1.z.string().min(1, 'Message is required'),
}).refine(data => (data.groups && data.groups.length > 0) || (data.userIds && data.userIds.length > 0), {
    message: 'At least one group or user must be selected',
});
// For fetching messages (inbox, sent, drafts) – we’ll add pagination later
exports.getMessagesSchema = zod_1.z.object({
    type: zod_1.z.enum(['inbox', 'sent', 'drafts']).default('inbox'),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().optional(),
});
// For getting a single message detail
exports.getMessageSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
