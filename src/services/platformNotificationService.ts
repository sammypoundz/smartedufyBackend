// Platform notification center (Module 12).
import { prisma } from "../config/prisma";

export type NotificationType =
  | "SCHOOL_REGISTERED"
  | "SUBSCRIPTION_EXPIRING"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT"
  | "TOKEN_PURCHASE"
  | "LOW_BALANCE"
  | "AI_SPIKE"
  | "SYNC_FAILURE"
  | "SCHOOL_INACTIVITY"
  | "SUBSCRIPTION"
  | "INVOICE"
  | "SYSTEM";

export async function notifyPlatform(input: {
  type: NotificationType;
  title: string;
  message: string;
  schoolId?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  metadata?: any;
}) {
  try {
    return await prisma.platformNotification.create({
      data: {
        type: input.type,
        severity: input.severity || "INFO",
        title: input.title,
        message: input.message,
        schoolId: input.schoolId,
        metadata: input.metadata,
      },
    });
  } catch (e) {
    console.error("platform notification failed:", (e as Error).message);
    return null;
  }
}
