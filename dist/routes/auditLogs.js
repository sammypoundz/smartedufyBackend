"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auditLogs.ts
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const auth_2 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/audit-logs — paginated, filterable audit trail (admin only)
router.get("/", (0, auth_2.privilegeGuard)("audit-logs"), async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId;
        const { page = "1", limit = "50", userId, action, entity, search, from, to, } = req.query;
        const where = { schoolId };
        if (userId)
            where.userId = userId;
        if (action)
            where.action = action.toUpperCase();
        if (entity)
            where.entity = { contains: entity, options: "i" };
        if (from || to) {
            where.createdAt = {};
            if (from)
                where.createdAt.gte = new Date(from);
            if (to)
                where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
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
            prisma_1.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (pageNum - 1) * perPage,
                take: perPage,
            }),
            prisma_1.prisma.auditLog.count({ where }),
        ]);
        res.json({
            logs,
            total,
            page: pageNum,
            pages: Math.ceil(total / perPage),
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
