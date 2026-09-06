// src/routes/auditLogs.ts
import { Router } from "express";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { privilegeGuard } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/audit-logs — paginated, filterable audit trail (admin only)
router.get(
  "/",
  privilegeGuard("audit-logs"),
  async (req: AuthRequest, res, next) => {
    try {
      const schoolId = req.user!.schoolId;
      const {
        page = "1",
        limit = "50",
        userId,
        action,
        entity,
        search,
        from,
        to,
      } = req.query as Record<string, string>;

      const where: any = { schoolId };
      if (userId) where.userId = userId;
      if (action) where.action = action.toUpperCase();
      if (entity) where.entity = { contains: entity, options: "i" };
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
      }
      if (search) {
        where.OR = [
          { description: { contains: search, options: "i" } },
          { userName: { contains: search, options: "i" } },
          { userEmail: { contains: search, options: "i" } },
          { path: { contains: search, options: "i" } },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const perPage = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * perPage,
          take: perPage,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        logs,
        total,
        page: pageNum,
        pages: Math.ceil(total / perPage),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
