// src/services/auditService.ts
import { prisma } from "../config/prisma";

export interface AuditLogInput {
  schoolId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  action: string; // CREATE | UPDATE | DELETE | LOGIN | LOGOUT | VIEW | EXPORT | ...
  entity?: string | null;
  entityId?: string | null;
  description: string;
  method?: string | null;
  path?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: any;
}

/**
 * Fire-and-forget audit logging. Never throws — a logging failure must not
 * break the request it is auditing.
 */
export function logActivity(input: AuditLogInput): void {
  prisma.auditLog
    .create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId || undefined,
        userName: input.userName ?? undefined,
        userEmail: input.userEmail ?? undefined,
        userRole: input.userRole ?? undefined,
        action: input.action,
        entity: input.entity ?? undefined,
        entityId: input.entityId ?? undefined,
        description: input.description,
        method: input.method ?? undefined,
        path: input.path ?? undefined,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.metadata === undefined ? undefined : input.metadata,
      },
    })
    .catch((err) => console.error("Audit log failed:", err?.message || err));
}

/** Derive a friendly action name from an HTTP method. */
export function actionFromMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return method.toUpperCase();
  }
}

/** Human readable entity name from an API path, e.g. /api/students → Students */
export function entityFromPath(path: string): string {
  const clean = path
    .replace(/^\/api\//, "")
    .split(/[/?]/)[0]
    .replace(/-/g, " ")
    .trim();
  if (!clean) return "Unknown";
  // Singularise & capitalise
  const singular = clean.endsWith("s") ? clean.slice(0, -1) : clean;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * Friendly, plain-English phrases for entities, e.g. "a user account",
 * "a student record". Used to build messages like
 * "created a user account".
 */
const ENTITY_PHRASES: Record<string, string> = {
  User: "a user account",
  Student: "a student record",
  Teacher: "a teacher record",
  Parent: "a parent record",
  Staff: "a staff record",
  Class: "a class",
  Arm: "an arm",
  Subject: "a subject",
  Result: "results",
  Attendance: "attendance",
  Test: "a test",
  Question: "a question",
  TestAttempt: "a test submission",
  Fee: "fees",
  Feestructure: "a fee structure",
  Feepayment: "a fee payment",
  Payroll: "payroll",
  Expense: "an expense",
  Budget: "a budget",
  Message: "a message",
  Timetable: "the timetable",
  LessonPlan: "a lesson plan",
  Inventory: "an inventory item",
  Role: "a role",
  Setting: "settings",
  Academic: "academic settings",
  Promotion: "promotions",
  Grading: "grading scales",
  Skill: "skills",
  Assessment: "assessment formats",
  Login: "their account",
};

function entityPhrase(entity?: string | null): string {
  if (!entity) return "a record";
  return ENTITY_PHRASES[entity] || `a ${entity.toLowerCase()} record`;
}

/**
 * Plain-English description of what happened, e.g.
 * "updated a user account", "signed into the system".
 */
export function humanDescription(action: string, entity?: string | null): string {
  const phrase = entityPhrase(entity);
  switch (action) {
    case "CREATE":
      return `created ${phrase}`;
    case "UPDATE":
      return `updated ${phrase}`;
    case "DELETE":
      return `deleted ${phrase}`;
    case "LOGIN":
      return "signed into the system";
    case "LOGOUT":
      return "signed out of the system";
    case "VIEW":
      return `viewed ${phrase}`;
    case "EXPORT":
      return `exported ${phrase}`;
    default:
      return `${action.toLowerCase()} ${phrase}`;
  }
}
