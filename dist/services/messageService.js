"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageService = void 0;
const db_1 = __importDefault(require("../config/db"));
const messaging_1 = require("../utils/messaging");
const client_1 = require("@prisma/client");
const tenantContext_1 = require("../utils/tenantContext");
const ROLE_MAP = {
    all: [client_1.Role.ADMIN, client_1.Role.BURSAR, client_1.Role.TEACHER, client_1.Role.PARENT, client_1.Role.STUDENT],
    admin: [client_1.Role.ADMIN],
    teacher: [client_1.Role.TEACHER],
    parent: [client_1.Role.PARENT],
    student: [client_1.Role.STUDENT],
    staff: [client_1.Role.ADMIN, client_1.Role.BURSAR, client_1.Role.TEACHER],
};
exports.messageService = {
    // Send broadcast message to groups and/or individual users
    sendBroadcast: async (senderId, payload) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('📨 sendBroadcast payload:', payload);
        // 1. Resolve groups to user IDs (middleware will add schoolId to User queries)
        let userIdsFromGroups = [];
        if (payload.groups?.length) {
            const roles = payload.groups.flatMap(g => ROLE_MAP[g] || []);
            console.log('🔍 Resolved roles from groups:', roles);
            const users = await db_1.default.user.findMany({
                where: { role: { in: roles }, isActive: true },
                select: { id: true },
            });
            userIdsFromGroups = users.map(u => u.id);
            console.log(`👥 Found ${userIdsFromGroups.length} users from groups`);
        }
        // 2. Combine and deduplicate
        const allUserIds = [...new Set([...userIdsFromGroups, ...(payload.userIds || [])])];
        console.log(`🧑‍🤝‍🧑 Total unique user IDs after combining: ${allUserIds.length}`);
        if (allUserIds.length === 0) {
            throw new Error('No recipients selected');
        }
        // 3. Fetch recipient details (email/phone) – middleware adds schoolId
        const recipients = await db_1.default.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, email: true, phone: true, name: true },
        });
        // 4. Filter valid recipients based on delivery type
        const validRecipients = recipients.filter(r => payload.type === 'email' ? r.email : r.phone);
        if (validRecipients.length === 0) {
            throw new Error(`No recipients have a valid ${payload.type} contact`);
        }
        // 5. Send messages concurrently (with error handling per recipient)
        const sendPromises = validRecipients.map(async (recipient) => {
            try {
                if (payload.type === 'email') {
                    await (0, messaging_1.sendEmail)(recipient.email, payload.subject || 'Fee Message', payload.message);
                }
                else {
                    await (0, messaging_1.sendSMS)(recipient.phone, payload.message);
                }
                return { recipientId: recipient.id, success: true };
            }
            catch (error) {
                return { recipientId: recipient.id, success: false, error: error.message };
            }
        });
        const settled = await Promise.allSettled(sendPromises);
        const finalResults = settled.map(r => r.value);
        // 6. Store the broadcast message in DB – include schoolId
        const recipientInfo = validRecipients.map(r => ({
            type: 'user',
            id: r.id,
            name: r.name,
        }));
        await db_1.default.message.create({
            data: {
                senderId,
                subject: payload.subject || null,
                content: payload.message,
                type: payload.type,
                recipients: recipientInfo,
                schoolId: tenantId,
            },
        });
        // 7. Return summary
        return {
            totalRecipients: validRecipients.length,
            successCount: finalResults.filter(r => r.success).length,
            failureCount: finalResults.filter(r => !r.success).length,
            details: finalResults,
        };
    },
    // Get messages (inbox / sent)
    // Drafts: return empty for now – you can add a `isDraft` boolean to Message later.
    getMessages: async (userId, filters) => {
        // Drafts not implemented yet
        if (filters.type === 'drafts') {
            return {
                data: [],
                total: 0,
                page: filters.page,
                limit: filters.limit,
                totalPages: 0,
            };
        }
        // Sent messages – middleware will add schoolId to the Message query
        if (filters.type === 'sent') {
            const where = { senderId: userId };
            const [data, total] = await Promise.all([
                db_1.default.message.findMany({
                    where,
                    orderBy: { sentAt: 'desc' },
                    skip: (filters.page - 1) * filters.limit,
                    take: filters.limit,
                    include: {
                        sender: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                }),
                db_1.default.message.count({ where }),
            ]);
            return {
                data,
                total,
                page: filters.page,
                limit: filters.limit,
                totalPages: Math.ceil(total / filters.limit),
            };
        }
        // Inbox: filter messages where user is in recipients array
        // Since we can't add a JSON contains filter easily with Prisma's MongoDB connector,
        // we still do in‑memory filtering – but we still scope the initial query by schoolId.
        const allMessages = await db_1.default.message.findMany({
            orderBy: { sentAt: 'desc' },
            include: {
                sender: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        const inboxMessages = allMessages.filter(msg => {
            const recipients = msg.recipients;
            return recipients.some(r => r.id === userId);
        });
        // Apply search
        let filtered = inboxMessages;
        if (filters.search) {
            const s = filters.search.toLowerCase();
            filtered = filtered.filter(msg => msg.subject?.toLowerCase().includes(s) ||
                msg.content.toLowerCase().includes(s) ||
                msg.sender.name?.toLowerCase().includes(s));
        }
        // Paginate manually (since we filtered in memory)
        const start = (filters.page - 1) * filters.limit;
        const paginated = filtered.slice(start, start + filters.limit);
        return {
            data: paginated,
            total: filtered.length,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(filtered.length / filters.limit),
        };
    },
    // Get single message detail – middleware will add schoolId
    getMessage: async (messageId) => {
        const message = await db_1.default.message.findUnique({
            where: { id: messageId },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        if (!message)
            throw new Error('Message not found');
        return message;
    },
};
