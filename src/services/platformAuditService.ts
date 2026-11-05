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
  // Some cron/background flows log under a synthetic actor (e.g. "system"),
  // but actorId is a Mongo ObjectId column. If the value isn't a valid
  // ObjectId, fall back to logging without it rather than crashing the write.
  const isValidObjectId = (v: string) => /^[0-9a-fA-F]{24}$/.test(v);
  let actorId = input.actorId;
  if (!isValidObjectId(actorId)) {
    if (!input.actorName) {
      input.actorName = actorId; // preserve who/what triggered this
    }
    actorId = process.env.PLATFORM_AUDIT_SYSTEM_ID || "000000000000000000000000";
  }
  try {
    await prisma.platformAuditLog.create({
      data: {
        actorId,
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
