"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPlatformActivity = logPlatformActivity;
// Audit logging for every sensitive Super Admin action.
const prisma_1 = require("../config/prisma");
async function logPlatformActivity(input) {
    try {
        await prisma_1.prisma.platformAuditLog.create({
            data: {
                actorId: input.actorId,
                actorName: input.actorName,
                actorRole: input.actorRole,
                action: input.action,
                targetType: input.targetType,
                targetId: input.targetId,
                description: input.description,
                metadata: input.metadata ?? undefined,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
            },
        });
    }
    catch (e) {
        // Never let audit failures break a request — log to console instead.
        console.error("platform audit log failed:", e.message);
    }
}
