// src/middleware/audit.ts
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../config/prisma";
import {
  logActivity,
  actionFromMethod,
  entityFromPath,
  humanDescription,
} from "../services/auditService";
import type { AuditLogInput } from "../services/auditService";

// Requests that should NOT be auto-logged (would flood the log)
const SKIP_PATHS = ["/api/audit-logs", "/api/health"];

/**
 * Global audit middleware — logs every mutating (POST/PUT/PATCH/DELETE)
 * request made by an authenticated user. Read-heavy GETs are not logged
 * automatically (use logActivity explicitly for important reads like exports).
 *
 * Fire-and-forget: response is never delayed or blocked by logging.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
    if (SKIP_PATHS.some((p) => req.path === p || req.path.startsWith(p + "/"))) return;
    if (res.statusCode >= 500) return;

    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) return; // unauthenticated requests have no actor to blame

    const action = actionFromMethod(method);
    const entity = entityFromPath(req.originalUrl || req.path);
    const params = (req.params || {}) as Record<string, string>;
    const entityId = params.id || params.studentId || params.teacherId || undefined;

    const write = (name?: string | null, email?: string | null) => {
      const payload: AuditLogInput = {
        schoolId: user.schoolId,
        userId: user.id,
        userName: name || user.name || null,
        userEmail: email || user.email || null,
        userRole: user.role,
        action,
        entity,
        entityId,
        description: humanDescription(action, entity),
        method,
        path: req.originalUrl,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      };
      logActivity(payload);
    };

    // JWTs issued before name/email was added to the token fall back to a
    // DB lookup so the log always shows WHO did it, never "Unknown".
    if (!user.name || !user.email) {
      prisma.user
        .findUnique({ where: { id: user.id }, select: { name: true, email: true } })
        .then((dbUser) => write(dbUser?.name, dbUser?.email))
        .catch(() => write());
    } else {
      write(user.name, user.email);
    }
  });
  next();
}
