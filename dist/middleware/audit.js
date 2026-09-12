"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMiddleware = auditMiddleware;
const prisma_1 = require("../config/prisma");
const auditService_1 = require("../services/auditService");
// Requests that should NOT be auto-logged (would flood the log)
const SKIP_PATHS = ["/api/audit-logs", "/api/health"];
/**
 * Global audit middleware — logs every mutating (POST/PUT/PATCH/DELETE)
 * request made by an authenticated user. Read-heavy GETs are not logged
 * automatically (use logActivity explicitly for important reads like exports).
 *
 * Fire-and-forget: response is never delayed or blocked by logging.
 */
function auditMiddleware(req, res, next) {
    res.on("finish", () => {
        const method = req.method.toUpperCase();
        if (!["POST", "PUT", "PATCH", "DELETE"].includes(method))
            return;
        if (SKIP_PATHS.some((p) => req.path === p || req.path.startsWith(p + "/")))
            return;
        if (res.statusCode >= 500)
            return;
        const authReq = req;
        const user = authReq.user;
        if (!user)
            return; // unauthenticated requests have no actor to blame
        const action = (0, auditService_1.actionFromMethod)(method);
        const entity = (0, auditService_1.entityFromPath)(req.originalUrl || req.path);
        const params = (req.params || {});
        const entityId = params.id || params.studentId || params.teacherId || undefined;
        const write = (name, email) => {
            const payload = {
                schoolId: user.schoolId,
                userId: user.id,
                userName: name || user.name || null,
                userEmail: email || user.email || null,
                userRole: user.role,
                action,
                entity,
                entityId,
                description: (0, auditService_1.humanDescription)(action, entity),
                method,
                path: req.originalUrl,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
            };
            (0, auditService_1.logActivity)(payload);
        };
        // JWTs issued before name/email was added to the token fall back to a
        // DB lookup so the log always shows WHO did it, never "Unknown".
        if (!user.name || !user.email) {
            prisma_1.prisma.user
                .findUnique({ where: { id: user.id }, select: { name: true, email: true } })
                .then((dbUser) => write(dbUser?.name, dbUser?.email))
                .catch(() => write());
        }
        else {
            write(user.name, user.email);
        }
    });
    next();
}
