// Audit logging for every sensitive Super Admin action.
import { prisma } from "../config/prisma";

export interface PlatformAuditInput {
  actorId: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  description: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logPlatformActivity(input: PlatformAuditInput) {
  try {
    await prisma.platformAuditLog.create({
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
  } catch (e) {
    // Never let audit failures break a request — log to console instead.
    console.error("platform audit log failed:", (e as Error).message);
  }
}
