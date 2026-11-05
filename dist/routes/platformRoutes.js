"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// SUPER ADMIN PLATFORM API — /api/platform/*
// Separate auth realm (platform JWTs). Covers:
//  - auth + users (M13)
//  - overview KPIs + charts (M1)
//  - school directory + profiles + admin actions (M2)
//  - student & staff analytics (M3)
//  - subscriptions & billing (M4)
//  - revenue & fee analytics (M5, M6)
//  - token wallets (M7)
//  - AI usage & profitability (M8)
//  - onboarding batches (M9)
//  - forecasting (M10)
//  - system health + notifications (M11, M12)
//  - audit logs (M14)
// ============================================================
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const platformAuth_1 = require("../middleware/platformAuth");
const platformAuditService_1 = require("../services/platformAuditService");
const tokenWalletService_1 = require("../services/tokenWalletService");
const platformSettingsService_1 = require("../services/platformSettingsService");
const billingService_1 = require("../services/billingService");
const platformNotificationService_1 = require("../services/platformNotificationService");
const router = (0, express_1.Router)();
// ---------- helpers ----------
const startOfDay = (d = new Date()) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};
const startOfMonth = (d = new Date()) => {
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    return x;
};
const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);
const daysAgo = (n) => {
    const x = startOfDay();
    x.setDate(x.getDate() - n);
    return x;
};
const asyncRoute = (fn) => (req, res) => {
    fn(req, res).catch((e) => {
        console.error("platform route error:", e.message);
        res
            .status(e.status || 500)
            .json({ error: e.message || "Internal server error" });
    });
};
const auth = [platformAuth_1.platformAuth];
// ============================================================
// MODULE 13 — AUTH & USERS
// ============================================================
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post("/auth/login", asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma_1.prisma.platformUser.findUnique({
        where: { email: email.toLowerCase() },
    });
    if (!user || !user.isActive)
        return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcryptjs_1.default.compare(password, user.password);
    if (!valid)
        return res.status(401).json({ error: "Invalid credentials" });
    await prisma_1.prisma.platformUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "LOGIN",
        description: "Platform console login",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });
    const token = (0, platformAuth_1.signPlatformToken)({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    });
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mfaEnabled: user.mfaEnabled,
        },
    });
}));
router.get("/auth/me", auth, asyncRoute(async (req, res) => {
    res.json(req.platformUser);
}));
const userSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    role: zod_1.z.enum([
        "SUPER_ADMIN",
        "FINANCE_ADMIN",
        "ONBOARDING_OFFICER",
        "SUPPORT_OFFICER",
        "ANALYTICS_VIEWER",
    ]),
});
router.get("/users", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN"), asyncRoute(async (_req, res) => {
    const users = await prisma_1.prisma.platformUser.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            mfaEnabled: true,
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });
    res.json(users);
}));
router.post("/users", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN"), asyncRoute(async (req, res) => {
    const data = userSchema.parse(req.body);
    const exists = await prisma_1.prisma.platformUser.findUnique({
        where: { email: data.email.toLowerCase() },
    });
    if (exists)
        return res.status(409).json({ error: "Email already exists" });
    const user = await prisma_1.prisma.platformUser.create({
        data: {
            name: data.name,
            email: data.email.toLowerCase(),
            password: await bcryptjs_1.default.hash(data.password, 10),
            role: data.role,
        },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "PLATFORM_USER_CREATE",
        targetType: "PlatformUser",
        targetId: user.id,
        description: `Created platform user ${user.email} (${user.role})`,
        ipAddress: req.ip,
    });
    res
        .status(201)
        .json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    });
}));
router.patch("/users/:id", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        isActive: zod_1.z.boolean().optional(),
        role: zod_1.z.string().optional(),
    });
    const data = schema.parse(req.body);
    const target = await prisma_1.prisma.platformUser.findUnique({
        where: { id: String(req.params.id) },
    });
    if (!target)
        return res.status(404).json({ error: "User not found" });
    if (target.role === "SUPER_ADMIN" && data.isActive === false) {
        const activeSupers = await prisma_1.prisma.platformUser.count({
            where: { role: "SUPER_ADMIN", isActive: true },
        });
        if (activeSupers <= 1)
            return res
                .status(400)
                .json({ error: "Cannot disable the last active Super Admin" });
    }
    const user = await prisma_1.prisma.platformUser.update({
        where: { id: target.id },
        data,
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "PLATFORM_USER_UPDATE",
        targetType: "PlatformUser",
        targetId: user.id,
        description: `Updated platform user ${user.email}`,
        metadata: data,
        ipAddress: req.ip,
    });
    res.json({ id: user.id, isActive: user.isActive, role: user.role });
}));
// ============================================================
// MODULE 1 — OVERVIEW
// ============================================================
router.get("/overview", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    const now = new Date();
    const [totalSchools, activeSchools, inactiveSchools, newSchools30d, totalStudents, totalTeachers, totalParents, subscriptionPaymentsAgg, tokenLedgerAgg, aiCostAgg, subsActive, subsExpired, plans,] = await Promise.all([
        prisma_1.prisma.school.count(),
        prisma_1.prisma.school.count({ where: { isActive: true } }),
        prisma_1.prisma.school.count({ where: { isActive: false } }),
        prisma_1.prisma.school.count({ where: { createdAt: { gte: daysAgo(30) } } }),
        prisma_1.prisma.student.count(),
        prisma_1.prisma.teacher.count(),
        prisma_1.prisma.parent.count(),
        prisma_1.prisma.subscriptionPayment.aggregate({ _sum: { amount: true } }),
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "PURCHASE" },
        }),
        prisma_1.prisma.aiUsageLog.aggregate({ _sum: { costNgn: true } }),
        prisma_1.prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma_1.prisma.subscription.count({ where: { status: "EXPIRED" } }),
        prisma_1.prisma.subscriptionPlan.findMany({ where: { isActive: true } }),
    ]);
    const totalRevenue = (subscriptionPaymentsAgg._sum.amount || 0) +
        (tokenLedgerAgg._sum.amount || 0) * (await (0, platformSettingsService_1.getTokenPrice)());
    const aiExpenses = aiCostAgg._sum.costNgn || 0;
    // Time-window revenue
    const [monthSub, monthTokens, yearSub, yearTokens] = await Promise.all([
        prisma_1.prisma.subscriptionPayment.aggregate({
            _sum: { amount: true },
            where: { paidAt: { gte: startOfMonth() } },
        }),
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "PURCHASE", createdAt: { gte: startOfMonth() } },
        }),
        prisma_1.prisma.subscriptionPayment.aggregate({
            _sum: { amount: true },
            where: { paidAt: { gte: startOfYear() } },
        }),
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "PURCHASE", createdAt: { gte: startOfYear() } },
        }),
    ]);
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    res.json({
        schools: {
            total: totalSchools,
            active: activeSchools,
            inactive: inactiveSchools,
            newThisMonth: newSchools30d,
        },
        users: {
            students: totalStudents,
            teachers: totalTeachers,
            parents: totalParents,
            total: totalStudents + totalTeachers + totalParents,
        },
        revenue: {
            total: totalRevenue,
            subscriptions: subscriptionPaymentsAgg._sum.amount || 0,
            tokens: (tokenLedgerAgg._sum.amount || 0) * tokenPrice,
            thisMonth: (monthSub._sum.amount || 0) +
                (monthTokens._sum.amount || 0) * tokenPrice,
            thisYear: (yearSub._sum.amount || 0) +
                (yearTokens._sum.amount || 0) * tokenPrice,
            aiExpenses,
            contribution: totalRevenue - aiExpenses,
        },
        subscriptions: {
            active: subsActive,
            expired: subsExpired,
            plans: plans.length,
        },
        generatedAt: now.toISOString(),
    });
}));
// ============================================================
// MODULE 2 — SCHOOLS
// ============================================================
router.get("/schools", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER", "ONBOARDING_OFFICER", "ANALYTICS_VIEWER"), asyncRoute(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25);
    const where = {};
    if (q)
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { subdomain: { contains: q, mode: "insensitive" } },
        ];
    if (status === "active")
        where.isActive = true;
    if (status === "inactive")
        where.isActive = false;
    const [schools, total] = await Promise.all([
        prisma_1.prisma.school.findMany({
            where,
            select: {
                id: true,
                name: true,
                subdomain: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { students: true, teachers: true, users: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma_1.prisma.school.count({ where }),
    ]);
    const schoolIds = schools.map((s) => s.id);
    const [subs, wallets] = await Promise.all([
        prisma_1.prisma.subscription.findMany({
            where: { schoolId: { in: schoolIds } },
            include: { plan: true },
        }),
        prisma_1.prisma.tokenWallet.findMany({ where: { schoolId: { in: schoolIds } } }),
    ]);
    const subMap = new Map(subs.map((s) => [s.schoolId, s]));
    const walletMap = new Map(wallets.map((w) => [w.schoolId, w]));
    res.json({
        total,
        page,
        pageSize,
        schools: schools.map((s) => {
            const sub = subMap.get(s.id);
            return {
                ...s,
                students: s._count.students,
                teachers: s._count.teachers,
                users: s._count.users,
                subscription: sub
                    ? { plan: sub.plan.name, status: sub.status, endDate: sub.endDate }
                    : null,
                wallet: walletMap.get(s.id)
                    ? {
                        balance: walletMap.get(s.id).balance,
                        reserved: walletMap.get(s.id).reserved,
                    }
                    : { balance: 0, reserved: 0 },
            };
        }),
    });
}));
// Register a new school (platform action, audited)
const createSchoolSchema = zod_1.z.object({
    schoolName: zod_1.z.string().min(2).max(120),
    adminName: zod_1.z.string().min(2).max(120),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().max(30).optional(),
    password: zod_1.z.string().min(8),
});
router.post("/schools", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN"), asyncRoute(async (req, res) => {
    const data = createSchoolSchema.parse(req.body);
    const exists = await prisma_1.prisma.school.findFirst({
        where: { name: { equals: data.schoolName, mode: "insensitive" } },
    });
    if (exists)
        return res
            .status(409)
            .json({ error: "A school with this name already exists" });
    const emailTaken = await prisma_1.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
    });
    if (emailTaken)
        return res.status(409).json({ error: "Admin email already in use" });
    const hashed = await bcryptjs_1.default.hash(data.password, 10);
    const school = await prisma_1.prisma.school.create({
        data: {
            name: data.schoolName,
            subdomain: data.schoolName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 40),
        },
    });
    await prisma_1.prisma.user.create({
        data: {
            name: data.adminName,
            email: data.email.toLowerCase(),
            phone: data.phone,
            password: hashed,
            role: "ADMIN",
            isActive: true,
            schoolId: school.id,
        },
    });
    await (0, platformNotificationService_1.notifyPlatform)({
        type: "SCHOOL_REGISTERED",
        title: "New school registered",
        message: `${school.name} was registered by ${req.platformUser.name}.`,
        schoolId: school.id,
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "SCHOOL_CREATE",
        targetType: "School",
        targetId: school.id,
        description: `Registered new school ${school.name}`,
        ipAddress: req.ip,
    });
    res.status(201).json(school);
}));
router.get("/schools/:id", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER", "ONBOARDING_OFFICER", "ANALYTICS_VIEWER"), asyncRoute(async (req, res) => {
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: String(req.params.id) },
        select: {
            id: true,
            name: true,
            subdomain: true,
            isActive: true,
            createdAt: true,
            _count: {
                select: {
                    students: true,
                    teachers: true,
                    parents: true,
                    classes: true,
                    users: true,
                },
            },
        },
    });
    if (!school)
        return res.status(404).json({ error: "School not found" });
    const [subscription, wallet, subsPayments, tokenPurchases, tokenCharges, aiCosts, feeBilled, feeCollected, recentUsers, classes, academicYears,] = await Promise.all([
        prisma_1.prisma.subscription.findUnique({
            where: { schoolId: school.id },
            include: { plan: true },
        }),
        prisma_1.prisma.tokenWallet.findUnique({ where: { schoolId: school.id } }),
        prisma_1.prisma.subscriptionPayment.findMany({
            where: { schoolId: school.id },
            orderBy: { paidAt: "desc" },
            take: 10,
        }),
        prisma_1.prisma.tokenLedger.findMany({
            where: { schoolId: school.id, type: "PURCHASE" },
            orderBy: { createdAt: "desc" },
            take: 10,
        }),
        prisma_1.prisma.tokenLedger.findMany({
            where: { schoolId: school.id, type: "CHARGE" },
            orderBy: { createdAt: "desc" },
            take: 10,
        }),
        prisma_1.prisma.aiUsageLog.aggregate({
            _sum: { costNgn: true },
            where: { schoolId: school.id },
        }),
        prisma_1.prisma.studentFee.aggregate({
            _sum: { amountAssigned: true },
            where: { schoolId: school.id },
        }),
        prisma_1.prisma.studentFee.aggregate({
            _sum: { amountPaid: true },
            where: { schoolId: school.id },
        }),
        prisma_1.prisma.user.findMany({
            where: { schoolId: school.id, role: { in: ["ADMIN", "TEACHER"] } },
            select: {
                name: true,
                email: true,
                role: true,
                isActive: true,
                updatedAt: true,
            },
            take: 10,
            orderBy: { updatedAt: "desc" },
        }),
        prisma_1.prisma.class.findMany({
            where: { schoolId: school.id },
            select: { id: true, name: true },
            take: 30,
        }),
        prisma_1.prisma.academicYear.findMany({
            where: { schoolId: school.id, isActive: true },
            select: { name: true },
        }),
    ]);
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    const schoolFeeBilled = feeBilled._sum.amountAssigned || 0;
    const schoolFeeCollected = feeCollected._sum.amountPaid || 0;
    const tokensPurchased = wallet?.lifetimePurchased || 0;
    const tokensConsumed = wallet?.lifetimeConsumed || 0;
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "SCHOOL_VIEW",
        targetType: "School",
        targetId: school.id,
        description: `Viewed school profile ${school.name}`,
        ipAddress: req.ip,
    });
    res.json({
        ...school,
        students: school._count.students,
        teachers: school._count.teachers,
        parents: school._count.parents,
        classes: school._count.classes,
        staff: school._count.users,
        subscription,
        wallet,
        subscriptionPayments: subsPayments,
        tokenPurchases,
        tokenCharges,
        financial: {
            subscriptionRevenue: subsPayments.reduce((s, p) => s + p.amount, 0),
            tokenRevenue: tokensPurchased * tokenPrice,
            aiExpenses: aiCosts._sum.costNgn || 0,
            feeBilled: schoolFeeBilled, // NOTE: school's own fee data — NOT SmartEdufy revenue
            feeCollected: schoolFeeCollected,
            feeOutstanding: Math.max(0, schoolFeeBilled - schoolFeeCollected),
            platformRevenue: subsPayments.reduce((s, p) => s + p.amount, 0) +
                tokensPurchased * tokenPrice,
        },
        operations: {
            activeUsers: recentUsers,
            classList: classes,
            activeAcademicYear: academicYears[0]?.name || null,
        },
    });
}));
router.patch("/schools/:id/status", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({ isActive: zod_1.z.boolean() });
    const { isActive } = schema.parse(req.body);
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: String(req.params.id) },
    });
    if (!school)
        return res.status(404).json({ error: "School not found" });
    const updated = await prisma_1.prisma.school.update({
        where: { id: school.id },
        data: { isActive },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: isActive ? "SCHOOL_ACTIVATE" : "SCHOOL_SUSPEND",
        targetType: "School",
        targetId: school.id,
        description: `${isActive ? "Activated" : "Suspended"} school ${school.name}`,
        ipAddress: req.ip,
    });
    res.json({ id: updated.id, isActive: updated.isActive });
}));
// ============================================================
// MODULE 3 — STUDENT & STAFF ANALYTICS
// ============================================================
router.get("/analytics/students-staff", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "ANALYTICS_VIEWER", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    const [students, teachers, parents, activeStudents, inactiveStudents, perSchool,] = await Promise.all([
        prisma_1.prisma.student.count(),
        prisma_1.prisma.teacher.count(),
        prisma_1.prisma.parent.count(),
        prisma_1.prisma.student.count({ where: { isActive: true } }),
        prisma_1.prisma.student.count({ where: { isActive: false } }),
        prisma_1.prisma.school.findMany({
            select: {
                id: true,
                name: true,
                isActive: true,
                _count: {
                    select: {
                        students: true,
                        teachers: true,
                        parents: true,
                        users: true,
                    },
                },
            },
        }),
    ]);
    // Daily registration series (last 30 days)
    const students30 = await prisma_1.prisma.student.findMany({
        where: { createdAt: { gte: daysAgo(30) } },
        select: { createdAt: true },
    });
    const byDay = {};
    for (const s of students30) {
        const k = s.createdAt.toISOString().slice(0, 10);
        byDay[k] = (byDay[k] || 0) + 1;
    }
    res.json({
        totals: { students, teachers, parents, activeStudents, inactiveStudents },
        perSchool: perSchool.map((s) => ({
            id: s.id,
            name: s.name,
            isActive: s.isActive,
            students: s._count.students,
            teachers: s._count.teachers,
            parents: s._count.parents,
            staff: s._count.users,
        })),
        registrationSeries: Object.entries(byDay)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
    });
}));
// ============================================================
// MODULE 4 — SUBSCRIPTIONS & BILLING
// ============================================================
const planSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(60),
    description: zod_1.z.string().max(300).optional(),
    // FIXED = flat monthly fee | FREE = ₦0, no automatic AI allowance | STUDENT_BASED = per-student-per-term
    type: zod_1.z.enum(["FREE", "FIXED", "STUDENT_BASED"]).default("FIXED"),
    // Monthly recurring price in NGN per school (FIXED type; 0 for FREE)
    monthlyPrice: zod_1.z.number().min(0).optional(),
    // NGN per eligible student per term (STUDENT_BASED only)
    perStudentRate: zod_1.z.number().positive().optional(),
    // AI tokens credited per successfully activated paid billing cycle
    aiTokenAllowance: zod_1.z.number().int().min(0).max(100000).optional(),
    gracePeriodDays: zod_1.z.number().int().min(0).max(90).optional(),
    maxStudents: zod_1.z.number().int().positive().nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
    // Marketing copy shown to schools browsing available plans
    tagline: zod_1.z.string().max(160).optional(),
    // Feature bullets: [{ label, comingSoon? }]
    features: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().min(1).max(120),
        comingSoon: zod_1.z.boolean().optional(),
    }))
        .max(20)
        .optional(),
    featured: zod_1.z.boolean().optional(),
});
const CYCLE_MONTHS = {
    MONTHLY: 1,
    QUARTERLY: 3,
    TERMLY: 3,
    HALF_YEARLY: 6,
    ANNUAL: 12,
};
const SUB_STATUSES = [
    "ACTIVE",
    "EXPIRED",
    "TRIAL",
    "SUSPENDED",
    "PENDING_RENEWAL",
    "PENDING_PAYMENT",
    "GRACE_PERIOD",
    "CANCELLED",
];
router.get("/plans", auth, asyncRoute(async (_req, res) => {
    res.json(await prisma_1.prisma.subscriptionPlan.findMany({
        orderBy: { monthlyPrice: "asc" },
    }));
}));
// ---- Canonical billing plans: exactly ONE billing plan exists (Pay Per
// Student). The flat-fee "Subscription" billing type has been scrapped.
// The super admin edits it; creating/deleting billing plans is disabled.
const CANONICAL_PLAN_NAMES = ["Pay Per Student"];
router.get("/plans", auth, asyncRoute(async (_req, res) => {
    res.json(await prisma_1.prisma.subscriptionPlan.findMany({
        orderBy: { monthlyPrice: "asc" },
    }));
}));
// DISABLED: billing plan creation. The product ships with exactly one
// canonical billing plan (Pay Per Student) — see prisma/seedBillingPlans.ts.
// Editing its pricing/copy is done via PUT.
router.post("/plans", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (_req, res) => {
    res.status(403).json({
        error: "Billing plans cannot be created. Only the canonical billing plan (Pay Per Student) exists — edit it instead.",
    });
}));
router.put("/plans/:id", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const data = planSchema.partial().parse(req.body);
    // Never allow changing the billing type or name of a canonical plan.
    delete data.type;
    delete data.name;
    // null maxStudents means "no cap" — convert to undefined so Prisma
    // doesn't overwrite the stored value unintentionally? No: null IS the
    // intent (clear the cap), and the column is Int? so null is valid there.
    const plan = await prisma_1.prisma.subscriptionPlan.update({
        where: { id: String(req.params.id) },
        data,
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "PLAN_UPDATE",
        targetType: "SubscriptionPlan",
        targetId: plan.id,
        description: `Updated ${plan.type} billing plan ${plan.name}` +
            (plan.type === "STUDENT_BASED"
                ? plan.perStudentRate != null
                    ? ` at ₦${plan.perStudentRate}/student/term`
                    : ""
                : ` at ₦${plan.monthlyPrice}/month`) +
            ` · AI allowance ${plan.aiTokenAllowance} tokens/cycle`,
        metadata: data,
        ipAddress: req.ip,
    });
    res.json(plan);
}));
router.get("/subscriptions", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    const subs = await prisma_1.prisma.subscription.findMany({
        include: { plan: true },
        orderBy: { endDate: "asc" },
    });
    // Resolve school names in bulk (schoolId is a plain ObjectId reference).
    const schoolIds = [...new Set(subs.map((s) => s.schoolId))];
    const schools = await prisma_1.prisma.school.findMany({
        where: { id: { in: schoolIds } },
        select: { id: true, name: true },
    });
    const schoolNameById = new Map(schools.map((sc) => [sc.id, sc.name]));
    const withPayments = await Promise.all(subs.map(async (s) => {
        const paid = await prisma_1.prisma.subscriptionPayment.aggregate({
            _sum: { amount: true },
            where: { subscriptionId: s.id, verified: true },
        });
        return {
            ...s,
            totalPaid: paid._sum.amount || 0,
            schoolName: schoolNameById.get(s.schoolId) || "Unknown school",
        };
    }));
    res.json({
        subscriptions: withPayments,
        summary: {
            active: withPayments.filter((s) => s.status === "ACTIVE").length,
            expired: withPayments.filter((s) => s.status === "EXPIRED").length,
            trial: withPayments.filter((s) => s.status === "TRIAL").length,
            pendingRenewal: withPayments.filter((s) => s.status === "PENDING_RENEWAL").length,
        },
    });
}));
router.post("/subscriptions", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        schoolId: zod_1.z.string(),
        planId: zod_1.z.string(),
        months: zod_1.z.number().int().positive().default(1),
        trial: zod_1.z.boolean().optional(),
        billingCycle: zod_1.z
            .enum(["MONTHLY", "QUARTERLY", "TERMLY", "HALF_YEARLY", "ANNUAL", "BIENNIALLY"])
            .optional(),
        // Per-school price override for the cycle (server-validated ≥ 0)
        pricePerCycle: zod_1.z.number().min(0).optional(),
        // Student-based billing: snapshot of eligible students taken NOW at
        // assignment time and locked for the cycle. Change-locked afterwards.
        studentSnapshotCount: zod_1.z.number().int().min(0).optional(),
        // Token override: super admin decides the bundled tokens at assign time.
        // 0 = no bundled tokens (school tops up itself). Omitted = plan default.
        aiTokenAllowance: zod_1.z.number().int().min(0).max(100000).optional(),
        schoolTermId: zod_1.z.string().optional(),
        reason: zod_1.z.string().max(300).optional(),
    });
    const data = schema.parse(req.body);
    const plan = await prisma_1.prisma.subscriptionPlan.findUnique({
        where: { id: data.planId },
    });
    if (!plan)
        return res.status(404).json({ error: "Plan not found" });
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: data.schoolId },
    });
    if (!school)
        return res.status(404).json({ error: "School not found" });
    // Server-side pricing — never trust a client-computed total.
    // FREE → ₦0. STUDENT_BASED → snapshot count × per-student rate (count is
    // re-derived server-side unless explicitly overridden with a reason).
    let pricePerCycle = data.pricePerCycle ?? plan.monthlyPrice;
    let studentSnapshotCount = data.studentSnapshotCount;
    if (plan.type === "FREE")
        pricePerCycle = 0;
    if (plan.type === "STUDENT_BASED") {
        const rate = plan.perStudentRate || 0;
        if (studentSnapshotCount === undefined) {
            // Eligible students = active student profiles in the school NOW.
            studentSnapshotCount = await prisma_1.prisma.student.count({
                where: { schoolId: school.id, isActive: true },
            });
        }
        // Per-student rate drives pricing — ignore any plan/monthly fallback.
        pricePerCycle = studentSnapshotCount * rate;
    }
    if (plan.type === "FIXED" && data.pricePerCycle === undefined) {
        // Use the tier's PlanPriceOverride for the chosen frequency when the
        // super admin didn't force a per-school price.
        const override = await prisma_1.prisma.planPriceOverride.findUnique({
            where: {
                planId_billingFrequency: {
                    planId: plan.id,
                    billingFrequency: data.billingCycle || "MONTHLY",
                },
            },
        });
        if (override)
            pricePerCycle = override.price;
    }
    const cycleMonths = CYCLE_MONTHS[data.billingCycle || "MONTHLY"] || data.months;
    const months = data.billingCycle ? cycleMonths : data.months;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);
    // Free plans activate immediately; paid plans without a recorded payment
    // sit in PENDING_PAYMENT until a verified payment lands.
    const status = plan.type === "FREE"
        ? "ACTIVE"
        : data.trial
            ? "TRIAL"
            : "PENDING_PAYMENT";
    const sub = await prisma_1.prisma.subscription.upsert({
        where: { schoolId: data.schoolId },
        create: {
            schoolId: data.schoolId,
            planId: data.planId,
            status,
            billingCycle: data.billingCycle || "MONTHLY",
            pricePerCycle,
            aiTokenAllowance: data.aiTokenAllowance, // null = plan default
            studentSnapshotCount,
            schoolTermId: data.schoolTermId,
            endDate,
            trial: data.trial || false,
        },
        update: {
            planId: data.planId,
            status,
            billingCycle: data.billingCycle || "MONTHLY",
            pricePerCycle,
            aiTokenAllowance: data.aiTokenAllowance, // null = plan default
            studentSnapshotCount,
            schoolTermId: data.schoolTermId,
            endDate,
            trial: data.trial || false,
        },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "SUBSCRIPTION_ASSIGN",
        targetType: "Subscription",
        targetId: sub.id,
        description: `Assigned ${plan.type} plan ${plan.name} to ${school.name} ` +
            `(₦${pricePerCycle.toLocaleString()}/${data.billingCycle || "MONTHLY"}` +
            (studentSnapshotCount !== undefined
                ? `, snapshot ${studentSnapshotCount} students`
                : "") +
            (data.aiTokenAllowance !== undefined
                ? `, tokens ${data.aiTokenAllowance}/cycle (override)`
                : `, tokens plan-default ${plan.aiTokenAllowance}/cycle`) +
            `, status ${status})` +
            (data.reason ? ` — reason: ${data.reason}` : ""),
        metadata: {
            pricePerCycle,
            studentSnapshotCount,
            aiTokenAllowance: data.aiTokenAllowance ?? plan.aiTokenAllowance,
            reason: data.reason,
        },
        ipAddress: req.ip,
    });
    res.status(201).json(sub);
}));
// Record a verified subscription payment (never marks sub paid without this)
router.post("/subscriptions/payments", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        schoolId: zod_1.z.string(),
        amount: zod_1.z.number().positive(),
        method: zod_1.z
            .enum(["TRANSFER", "CARD", "USSD", "CASH", "ADJUSTMENT"])
            .default("TRANSFER"),
        reference: zod_1.z.string().optional(),
        months: zod_1.z.number().int().positive().default(1),
        note: zod_1.z.string().optional(),
        verified: zod_1.z.boolean().default(true),
    });
    const data = schema.parse(req.body);
    const sub = await prisma_1.prisma.subscription.findUnique({
        where: { schoolId: data.schoolId },
    });
    if (!sub)
        return res
            .status(404)
            .json({ error: "School has no subscription. Assign a plan first." });
    const payment = await prisma_1.prisma.subscriptionPayment.create({
        data: {
            schoolId: data.schoolId,
            subscriptionId: sub.id,
            amount: data.amount,
            method: data.method,
            reference: data.reference,
            verified: data.verified,
            note: data.note,
        },
    });
    // Extend the subscription by the number of paid months
    const base = sub.endDate > new Date() ? sub.endDate : new Date();
    const newEnd = new Date(base);
    newEnd.setMonth(newEnd.getMonth() + data.months);
    await prisma_1.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "ACTIVE", endDate: newEnd },
    });
    // Credit the plan's AI token allowance once per verified paid cycle.
    // Honors a per-assignment token override set by the super admin at assign
    // time (0 = no bundled tokens); falls back to the plan's default.
    // Idempotent via the token-ledger unique (schoolId, reference).
    const plan = await prisma_1.prisma.subscriptionPlan.findUnique({
        where: { id: sub.planId },
    });
    const allowance = Math.max(0, sub.aiTokenAllowance ?? plan?.aiTokenAllowance ?? 100);
    let aiTokensGranted = 0;
    if (allowance > 0) {
        const ref = `SUB-${payment.id}`; // stable per payment → no double credit
        try {
            await tokenWalletService_1.tokenWalletService.purchase(data.schoolId, allowance, ref, {
                note: `Subscription AI allowance — ${plan?.name} (${data.months} cycle)`,
                metadata: { subscriptionPaymentId: payment.id, planId: plan?.id },
            });
            aiTokensGranted = allowance;
            await prisma_1.prisma.subscriptionPayment.update({
                where: { id: payment.id },
                data: { aiTokensGranted },
            });
        }
        catch (e) {
            // A duplicate reference is fine (payment already credited); anything
            // else must not fail the payment itself.
            if (!/already/i.test(e.message))
                console.error("allowance credit failed:", e.message);
        }
    }
    await (0, platformNotificationService_1.notifyPlatform)({
        type: "PAYMENT",
        title: "Subscription payment received",
        message: `₦${data.amount.toLocaleString()} received for subscription renewal.`,
        schoolId: data.schoolId,
        metadata: { amount: data.amount, months: data.months },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "SUBSCRIPTION_PAYMENT",
        targetType: "Subscription",
        targetId: sub.id,
        description: `Recorded ₦${data.amount} payment (${data.months} month(s)) for subscription`,
        ipAddress: req.ip,
    });
    res.status(201).json(payment);
}));
// ============================================================
// MODULE 5 — REVENUE ANALYTICS
// ============================================================
router.get("/revenue", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"), asyncRoute(async (_req, res) => {
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    const [subPayments, tokenPurchases, aiCosts, platformExpenses] = await Promise.all([
        prisma_1.prisma.subscriptionPayment.findMany({
            select: { amount: true, paidAt: true, verified: true, method: true },
        }),
        prisma_1.prisma.tokenLedger.findMany({
            where: { type: "PURCHASE" },
            select: { amount: true, createdAt: true },
        }),
        prisma_1.prisma.aiUsageLog.aggregate({ _sum: { costNgn: true } }),
        prisma_1.prisma.platformExpense.aggregate({ _sum: { amount: true } }),
    ]);
    const subRevenue = subPayments
        .filter((p) => p.verified)
        .reduce((s, p) => s + p.amount, 0);
    const tokenRevenue = tokenPurchases.reduce((s, p) => s + p.amount * tokenPrice, 0);
    const grossRevenue = subRevenue + tokenRevenue;
    const aiExpense = aiCosts._sum.costNgn || 0;
    const otherExpenses = platformExpenses._sum.amount || 0;
    // Monthly series (last 12 months)
    const monthly = {};
    for (const p of subPayments.filter((p) => p.verified)) {
        const k = p.paidAt.toISOString().slice(0, 7);
        monthly[k] = monthly[k] || { subs: 0, tokens: 0 };
        monthly[k].subs += p.amount;
    }
    for (const p of tokenPurchases) {
        const k = p.createdAt.toISOString().slice(0, 7);
        monthly[k] = monthly[k] || { subs: 0, tokens: 0 };
        monthly[k].tokens += p.amount * tokenPrice;
    }
    const series = Object.entries(monthly)
        .map(([month, v]) => ({ month, ...v, total: v.subs + v.tokens }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12);
    // By school
    const perSchool = await prisma_1.prisma.subscription.groupBy({
        by: ["schoolId"],
        _count: { id: true },
    });
    res.json({
        grossRevenue,
        subRevenue,
        tokenRevenue,
        aiExpenses: aiExpense,
        otherExpenses,
        contributionMargin: grossRevenue - aiExpense - otherExpenses,
        byMethod: subPayments
            .filter((p) => p.verified)
            .reduce((acc, p) => {
            acc[p.method] = (acc[p.method] || 0) + p.amount;
            return acc;
        }, {}),
        monthlySeries: series,
        note: "Revenue includes verified subscription payments and token purchases only. School fee collections are the schools\u2019 own income, NOT platform revenue.",
    });
}));
// ============================================================
// MODULE 6 — SCHOOL FEE ANALYTICS
// ============================================================
router.get("/fees", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"), asyncRoute(async (req, res) => {
    const schoolId = req.query.schoolId;
    const where = {};
    if (schoolId)
        where.schoolId = schoolId;
    const perSchool = await prisma_1.prisma.studentFee.groupBy({
        by: ["schoolId"],
        where,
        _sum: { amountAssigned: true, amountPaid: true },
        _count: { studentId: true },
    });
    const schools = await prisma_1.prisma.school.findMany({
        where: perSchool.length
            ? { id: { in: perSchool.map((r) => r.schoolId) } }
            : { id: "none" },
        select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    const rows = perSchool
        .map((r) => {
        const billed = r._sum.amountAssigned || 0;
        const collected = r._sum.amountPaid || 0;
        return {
            schoolId: r.schoolId,
            schoolName: nameMap.get(r.schoolId) || r.schoolId,
            billed,
            collected,
            outstanding: Math.max(0, billed - collected),
            collectionRate: billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0,
            students: r._count.studentId,
        };
    })
        .sort((a, b) => b.billed - a.billed);
    const totals = rows.reduce((acc, r) => ({
        billed: acc.billed + r.billed,
        collected: acc.collected + r.collected,
        outstanding: acc.outstanding + r.outstanding,
    }), { billed: 0, collected: 0, outstanding: 0 });
    res.json({
        totals: {
            ...totals,
            collectionRate: totals.billed > 0
                ? Math.round((totals.collected / totals.billed) * 1000) / 10
                : 0,
        },
        perSchool: rows,
        accountingNote: "School fees belong to the schools. SmartEdufy records commissions/fees separately as platform revenue.",
    });
}));
// ============================================================
// MODULE 7 — EDUFY WALLET & TOKENS
// ============================================================
router.get("/wallets", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    const wallets = await prisma_1.prisma.tokenWallet.findMany({
        orderBy: { balance: "asc" },
    });
    const schools = await prisma_1.prisma.school.findMany({
        where: { id: { in: wallets.map((w) => w.schoolId) } },
        select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    const [totalPurchased, totalConsumed, consumedToday] = await Promise.all([
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "PURCHASE" },
        }),
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "CHARGE" },
        }),
        prisma_1.prisma.tokenLedger.aggregate({
            _sum: { amount: true },
            where: { type: "CHARGE", createdAt: { gte: startOfDay() } },
        }),
    ]);
    res.json({
        tokenPrice,
        totals: {
            sold: totalPurchased._sum.amount || 0,
            consumed: Math.abs(totalConsumed._sum.amount || 0),
            unused: wallets.reduce((s, w) => s + w.balance, 0),
            salesRevenue: (totalPurchased._sum.amount || 0) * tokenPrice,
            consumedToday: Math.abs(consumedToday._sum.amount || 0),
        },
        wallets: wallets.map((w) => ({
            ...w,
            schoolName: nameMap.get(w.schoolId) || w.schoolId,
        })),
    });
}));
router.get("/wallets/:schoolId", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (req, res) => {
    const wallet = await tokenWalletService_1.tokenWalletService.getWallet(String(req.params.schoolId));
    const ledger = await tokenWalletService_1.tokenWalletService.ledger(String(req.params.schoolId), 100);
    const school = await prisma_1.prisma.school.findUnique({
        where: { id: String(req.params.schoolId) },
        select: { name: true },
    });
    res.json({ school: school?.name, wallet, ledger });
}));
router.post("/wallets/:schoolId/purchase", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        tokens: zod_1.z.number().int().positive(),
        reference: zod_1.z.string().min(3).max(100),
        note: zod_1.z.string().max(300).optional(),
    });
    const data = schema.parse(req.body);
    const result = await tokenWalletService_1.tokenWalletService.purchase(String(req.params.schoolId), data.tokens, data.reference, { note: data.note });
    if (!result.duplicate) {
        const school = await prisma_1.prisma.school.findUnique({
            where: { id: String(req.params.schoolId) },
            select: { name: true },
        });
        await (0, platformNotificationService_1.notifyPlatform)({
            type: "TOKEN_PURCHASE",
            title: "Token purchase recorded",
            message: `${school?.name || "School"} purchased ${data.tokens.toLocaleString()} tokens (₦${(data.tokens * (await (0, platformSettingsService_1.getTokenPrice)())).toLocaleString()}).`,
            schoolId: String(req.params.schoolId),
            metadata: { tokens: data.tokens },
        });
        await (0, platformAuditService_1.logPlatformActivity)({
            actorId: req.platformUser.id,
            actorName: req.platformUser.name,
            actorRole: req.platformUser.role,
            action: "WALLET_PURCHASE",
            targetType: "TokenWallet",
            targetId: String(req.params.schoolId),
            description: `Recorded purchase of ${data.tokens} tokens (ref: ${data.reference})`,
            ipAddress: req.ip,
        });
    }
    res.status(201).json(result);
}));
router.post("/wallets/:schoolId/adjust", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        tokens: zod_1.z
            .number()
            .int()
            .refine((n) => n !== 0, "Adjustment cannot be zero"),
        reason: zod_1.z.string().min(5, "A reason is required").max(300),
    });
    const data = schema.parse(req.body);
    const ref = `ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await tokenWalletService_1.tokenWalletService.adjust(String(req.params.schoolId), data.tokens, data.reason, ref);
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "WALLET_ADJUST",
        targetType: "TokenWallet",
        targetId: String(req.params.schoolId),
        description: `Wallet adjusted by ${data.tokens} tokens: ${data.reason}`,
        metadata: { tokens: data.tokens, reason: data.reason },
        ipAddress: req.ip,
    });
    res.status(201).json(result);
}));
router.get("/wallets/:schoolId/ledger", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 50);
    res.json(await tokenWalletService_1.tokenWalletService.ledger(String(req.params.schoolId), limit));
}));
// ============================================================
// MODULE 7c — BIA CONNECT token-purchase analytics
// Distinguishes BIA token revenue from subscription revenue.
// ============================================================
router.get("/payments/bia", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (req, res) => {
    const where = {};
    if (req.query.schoolId)
        where.schoolId = String(req.query.schoolId);
    if (req.query.status)
        where.status = String(req.query.status);
    if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from)
            where.createdAt.gte = new Date(String(req.query.from));
        if (req.query.to)
            where.createdAt.lte = new Date(String(req.query.to));
    }
    const txns = await prisma_1.prisma.biaPaymentTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
    });
    const schoolIds = [...new Set(txns.map((t) => t.schoolId))];
    const schools = await prisma_1.prisma.school.findMany({
        where: { id: { in: schoolIds } },
        select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    const successful = txns.filter((t) => t.fulfilled);
    const byDay = {};
    for (const t of successful) {
        const k = (t.paidAt || t.createdAt).toISOString().slice(0, 10);
        byDay[k] = (byDay[k] || 0) + t.amount;
    }
    const bySchool = {};
    for (const t of successful) {
        const name = nameMap.get(t.schoolId) || t.schoolId;
        bySchool[name] = (bySchool[name] || 0) + t.amount;
    }
    res.json({
        totals: {
            revenue: successful.reduce((s, t) => s + t.amount, 0),
            successfulCount: successful.length,
            pendingCount: txns.filter((t) => t.status === "PENDING").length,
            failedCount: txns.filter((t) => ["FAILED", "EXPIRED", "REVERSED"].includes(t.status)).length,
            tokensSold: successful.reduce((s, t) => s + t.tokenQuantity, 0),
        },
        revenueByDate: Object.entries(byDay)
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        revenueBySchool: Object.entries(bySchool)
            .map(([school, revenue]) => ({ school, revenue }))
            .sort((a, b) => b.revenue - a.revenue),
        transactions: txns.slice(0, 200).map((t) => ({
            id: t.id,
            internalReference: t.internalReference,
            biaReference: t.biaReference,
            schoolName: nameMap.get(t.schoolId) || t.schoolId,
            amount: t.amount,
            tokenQuantity: t.tokenQuantity,
            status: t.status,
            fulfilled: t.fulfilled,
            createdAt: t.createdAt,
            paidAt: t.paidAt,
        })),
        note: "BIA token-purchase revenue only — subscription revenue is reported separately under /platform/revenue.",
    });
}));
// ============================================================
// MODULE 7b — BILLING: overview, invoices, price overrides,
//             token packages, billing cron
// ============================================================
// ---- Billing overview (KPI strip for the Subscriptions & Billing page) ----
router.get("/billing/overview", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    const [pendingAgg, overdue, paidAgg, invoicesCount, events, upcomingSubs] = await Promise.all([
        prisma_1.prisma.invoice.aggregate({
            _sum: { amount: true },
            where: { status: "PENDING" },
        }),
        prisma_1.prisma.invoice.count({
            where: { status: "PENDING", dueDate: { lt: new Date() } },
        }),
        prisma_1.prisma.invoice.aggregate({
            _sum: { paidAmount: true },
            where: { status: "PAID" },
        }),
        prisma_1.prisma.invoice.count(),
        prisma_1.prisma.billingEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 25,
        }),
        prisma_1.prisma.subscription.findMany({
            where: { status: "ACTIVE", endDate: { lte: new Date(Date.now() + 30 * 86400000) } },
            include: { plan: true },
            orderBy: { endDate: "asc" },
            take: 10,
        }),
    ]);
    res.json({
        pendingAmount: pendingAgg._sum.amount || 0,
        collectedAmount: paidAgg._sum.paidAmount || 0,
        overdue,
        invoicesCount,
        recentEvents: events,
        upcomingRenewals: upcomingSubs.map((s) => ({
            id: s.id,
            schoolId: s.schoolId,
            plan: s.plan.name,
            endDate: s.endDate,
            billingCycle: s.billingCycle,
        })),
    });
}));
// ---- Invoice list (filter by school / status) ----
router.get("/invoices", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (req, res) => {
    const where = {};
    if (req.query.schoolId)
        where.schoolId = String(req.query.schoolId);
    if (req.query.status)
        where.status = String(req.query.status);
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const invoices = await prisma_1.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    const schoolIds = Array.from(new Set(invoices.map((i) => i.schoolId)));
    const schools = await prisma_1.prisma.school.findMany({
        where: { id: { in: schoolIds } },
        select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    res.json(invoices.map((i) => ({
        ...i,
        schoolName: nameMap.get(i.schoolId) || i.schoolId,
    })));
}));
// ---- Manually generate an invoice for a school (super admin) ----
router.post("/invoices/generate", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({ schoolId: zod_1.z.string() });
    const { schoolId } = schema.parse(req.body);
    const invoice = await billingService_1.billingService.generateInvoiceForSchool(schoolId, "MANUAL", req.platformUser.id);
    if (!invoice)
        return res.status(409).json({
            error: "No invoice generated — school may have no active paid subscription, or this period is already invoiced.",
        });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "INVOICE_GENERATE",
        targetType: "Invoice",
        targetId: invoice.id,
        description: `Manually generated invoice ${invoice.invoiceNo} (${invoice.amount})`,
        ipAddress: req.ip,
    });
    res.status(201).json(invoice);
}));
// ---- Record a verified invoice payment (extends subscription + tokens) ----
router.post("/invoices/:id/pay", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        paymentRef: zod_1.z.string().min(3).max(100),
        method: zod_1.z.enum(["TRANSFER", "CARD", "USSD", "CASH"]).default("TRANSFER"),
    });
    const data = schema.parse(req.body);
    const invoice = await billingService_1.billingService.payInvoice(String(req.params.id), data.paymentRef, data.method);
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "INVOICE_PAY",
        targetType: "Invoice",
        targetId: invoice.id,
        description: `Invoice ${invoice.invoiceNo} marked paid (ref ${data.paymentRef})`,
        ipAddress: req.ip,
    });
    res.json(invoice);
}));
// ---- Void an invoice ----
router.post("/invoices/:id/void", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const invoice = await prisma_1.prisma.invoice.update({
        where: { id: String(req.params.id) },
        data: { status: "VOID" },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "INVOICE_VOID",
        targetType: "Invoice",
        targetId: invoice.id,
        description: `Invoice ${invoice.invoiceNo} voided`,
        ipAddress: req.ip,
    });
    res.json(invoice);
}));
// ---- Per-tier price overrides (read all, upsert one) ----
router.get("/price-overrides", auth, asyncRoute(async (_req, res) => {
    res.json(await prisma_1.prisma.planPriceOverride.findMany());
}));
router.put("/price-overrides", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        planId: zod_1.z.string(),
        billingFrequency: zod_1.z.enum([
            "MONTHLY",
            "QUARTERLY",
            "TERMLY",
            "HALF_YEARLY",
            "ANNUAL",
            "BIENNIALLY",
        ]),
        price: zod_1.z.number().min(0),
    });
    const data = schema.parse(req.body);
    const override = await prisma_1.prisma.planPriceOverride.upsert({
        where: {
            planId_billingFrequency: {
                planId: data.planId,
                billingFrequency: data.billingFrequency,
            },
        },
        update: { price: data.price },
        create: data,
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "PRICE_OVERRIDE_SET",
        targetType: "PlanPriceOverride",
        targetId: override.id,
        description: `${data.billingFrequency} price set to ${data.price}`,
        ipAddress: req.ip,
    });
    res.json(override);
}));
// ---- Token packages CRUD ----
router.get("/token-packages", auth, asyncRoute(async (_req, res) => {
    res.json(await prisma_1.prisma.tokenPackage.findMany({
        orderBy: { sortOrder: "asc" },
    }));
}));
router.post("/token-packages", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(2).max(50),
        tokens: zod_1.z.number().int().positive(),
        price: zod_1.z.number().positive(),
        sortOrder: zod_1.z.number().int().default(0),
    });
    const data = schema.parse(req.body);
    const pkg = await prisma_1.prisma.tokenPackage.create({ data });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "TOKEN_PACKAGE_CREATE",
        targetType: "TokenPackage",
        targetId: pkg.id,
        description: `Created token package ${pkg.name}: ${pkg.tokens} tokens @ ${pkg.price}`,
        ipAddress: req.ip,
    });
    res.status(201).json(pkg);
}));
router.put("/token-packages/:id", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(2).max(50).optional(),
        tokens: zod_1.z.number().int().positive().optional(),
        price: zod_1.z.number().positive().optional(),
        isActive: zod_1.z.boolean().optional(),
        sortOrder: zod_1.z.number().int().optional(),
    });
    const data = schema.parse(req.body);
    const pkg = await prisma_1.prisma.tokenPackage.update({
        where: { id: String(req.params.id) },
        data,
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "TOKEN_PACKAGE_UPDATE",
        targetType: "TokenPackage",
        targetId: pkg.id,
        description: `Updated token package ${pkg.name}`,
        ipAddress: req.ip,
    });
    res.json(pkg);
}));
router.delete("/token-packages/:id", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const pkg = await prisma_1.prisma.tokenPackage.update({
        where: { id: String(req.params.id) },
        data: { isActive: false },
    });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "TOKEN_PACKAGE_DEACTIVATE",
        targetType: "TokenPackage",
        targetId: pkg.id,
        description: `Deactivated token package ${pkg.name}`,
        ipAddress: req.ip,
    });
    res.json(pkg);
}));
// ---- Billing cron (manual trigger for ops / testing) ----
router.post("/billing/cron", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const result = await billingService_1.billingService.runBillingCron();
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "BILLING_CRON_MANUAL",
        description: `Manual billing cron: ${JSON.stringify(result)}`,
        ipAddress: req.ip,
    });
    res.json(result);
}));
// ---- Complimentary token grant (subscription split, audited) ----
router.post("/wallets/:schoolId/grant", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({
        tokens: zod_1.z.number().int().positive().max(100000),
        note: zod_1.z.string().min(3).max(300),
    });
    const data = schema.parse(req.body);
    const ref = `GRANT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await tokenWalletService_1.tokenWalletService.allocate(String(req.params.schoolId), data.tokens, ref, { note: data.note, metadata: { grantedBy: req.platformUser.id } });
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "WALLET_GRANT",
        targetType: "TokenWallet",
        targetId: String(req.params.schoolId),
        description: `Granted ${data.tokens} subscription tokens: ${data.note}`,
        ipAddress: req.ip,
    });
    res.status(201).json(result);
}));
// Token price setting
router.get("/settings/token-price", auth, asyncRoute(async (_req, res) => {
    res.json({ tokenPrice: await (0, platformSettingsService_1.getTokenPrice)() });
}));
router.put("/settings/token-price", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const schema = zod_1.z.object({ tokenPrice: zod_1.z.number().positive() });
    const { tokenPrice } = schema.parse(req.body);
    await (0, platformSettingsService_1.setTokenPrice)(tokenPrice);
    await (0, platformAuditService_1.logPlatformActivity)({
        actorId: req.platformUser.id,
        actorName: req.platformUser.name,
        actorRole: req.platformUser.role,
        action: "TOKEN_PRICE_UPDATE",
        description: `Token price set to ₦${tokenPrice}`,
        metadata: { tokenPrice },
        ipAddress: req.ip,
    });
    res.json({ tokenPrice });
}));
// ============================================================
// MODULE 8 — AI USAGE & PROFITABILITY
// ============================================================
router.get("/ai/usage", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"), asyncRoute(async (req, res) => {
    const where = {};
    if (req.query.schoolId)
        where.schoolId = req.query.schoolId;
    if (req.query.operation)
        where.operation = req.query.operation;
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    const [total, success, failed, costAgg, bySchool, byOperation, byModel, series,] = await Promise.all([
        prisma_1.prisma.aiUsageLog.count({ where }),
        prisma_1.prisma.aiUsageLog.count({ where: { ...where, status: "SUCCESS" } }),
        prisma_1.prisma.aiUsageLog.count({ where: { ...where, status: "FAILED" } }),
        prisma_1.prisma.aiUsageLog.aggregate({
            _sum: {
                costNgn: true,
                revenueNgn: true,
                tokensCharged: true,
                inputTokens: true,
                outputTokens: true,
            },
            where,
        }),
        prisma_1.prisma.aiUsageLog.groupBy({
            by: ["schoolId"],
            where,
            _sum: { costNgn: true, tokensCharged: true, revenueNgn: true },
            _count: { id: true },
        }),
        prisma_1.prisma.aiUsageLog.groupBy({
            by: ["operation"],
            where,
            _sum: { costNgn: true, tokensCharged: true },
            _count: { id: true },
        }),
        prisma_1.prisma.aiUsageLog.groupBy({
            by: ["model"],
            where,
            _sum: { costNgn: true, inputTokens: true, outputTokens: true },
            _count: { id: true },
        }),
        prisma_1.prisma.aiUsageLog.findMany({
            where,
            select: {
                costNgn: true,
                revenueNgn: true,
                createdAt: true,
                status: true,
            },
            orderBy: { createdAt: "desc" },
            take: 500,
        }),
    ]);
    const schoolIds = [
        ...new Set(bySchool.map((b) => b.schoolId).filter(Boolean)),
    ];
    const schoolNames = schoolIds.length
        ? await prisma_1.prisma.school.findMany({
            where: { id: { in: schoolIds } },
            select: { id: true, name: true },
        })
        : [];
    const nameMap = new Map(schoolNames.map((s) => [s.id, s.name]));
    // Daily cost/revenue series (last 30 days of logs)
    const byDayMap = {};
    for (const log of series) {
        const k = log.createdAt.toISOString().slice(0, 10);
        byDayMap[k] = byDayMap[k] || { cost: 0, revenue: 0, scans: 0, failed: 0 };
        byDayMap[k].cost += log.costNgn;
        byDayMap[k].revenue += log.revenueNgn;
        if (log.status === "SUCCESS")
            byDayMap[k].scans++;
        else
            byDayMap[k].failed++;
    }
    const aiCost = costAgg._sum.costNgn || 0;
    const revenue = costAgg._sum.revenueNgn || 0;
    res.json({
        totals: {
            requests: total,
            success,
            failed,
            aiCost,
            revenue,
            tokensCharged: costAgg._sum.tokensCharged || 0,
            inputTokens: costAgg._sum.inputTokens || 0,
            outputTokens: costAgg._sum.outputTokens || 0,
            avgCostPerScan: success > 0 ? aiCost / success : 0,
            contribution: revenue - aiCost,
            marginPct: revenue > 0
                ? Math.round(((revenue - aiCost) / revenue) * 1000) / 10
                : 0,
        },
        bySchool: bySchool
            .map((b) => ({
            schoolId: b.schoolId,
            schoolName: b.schoolId
                ? nameMap.get(b.schoolId) || b.schoolId
                : "Platform (internal)",
            cost: b._sum.costNgn || 0,
            revenue: b._sum.revenueNgn || 0,
            tokensCharged: b._sum.tokensCharged || 0,
            requests: b._count.id,
        }))
            .sort((a, b) => b.cost - a.cost),
        byOperation: byOperation.map((b) => ({
            operation: b.operation,
            cost: b._sum.costNgn || 0,
            tokensCharged: b._sum.tokensCharged || 0,
            requests: b._count.id,
        })),
        byModel: byModel.map((b) => ({
            model: b.model,
            cost: b._sum.costNgn || 0,
            inputTokens: b._sum.inputTokens || 0,
            outputTokens: b._sum.outputTokens || 0,
            requests: b._count.id,
        })),
        dailySeries: Object.entries(byDayMap)
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        tokenPrice,
    });
}));
// ============================================================
// MODULE 11 — SYSTEM HEALTH
// ============================================================
router.get("/system/health", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "SUPPORT_OFFICER"), asyncRoute(async (_req, res) => {
    // DB connectivity
    let dbStatus = "UP";
    try {
        await prisma_1.prisma.$runCommandRaw({ ping: 1 });
    }
    catch {
        dbStatus = "DOWN";
    }
    const [schools, failedSyncs, recentSyncs, failedAis] = await Promise.all([
        prisma_1.prisma.school.count(),
        prisma_1.prisma.syncLog.count({
            where: { status: "FAILED", createdAt: { gte: daysAgo(7) } },
        }),
        prisma_1.prisma.syncLog.findMany({
            where: { createdAt: { gte: daysAgo(30) } },
            orderBy: { createdAt: "desc" },
            take: 500,
        }),
        prisma_1.prisma.aiUsageLog.count({
            where: { status: "FAILED", createdAt: { gte: daysAgo(7) } },
        }),
    ]);
    const lastSyncPerSchool = {};
    for (const s of recentSyncs) {
        if (!lastSyncPerSchool[s.schoolId] && s.status === "SUCCESS") {
            lastSyncPerSchool[s.schoolId] = s.createdAt.toISOString();
        }
    }
    res.json({
        database: dbStatus,
        api: "UP", // this handler executed = API is up
        aiProvider: process.env.GEMINI_API_KEY ? "CONFIGURED" : "NOT_CONFIGURED",
        platform: {
            totalSchools: schools,
            failedSyncsLast7d: failedSyncs,
            failedAiLast7d: failedAis,
        },
        lastSyncPerSchool,
        note: "Credentials and API keys are never exposed here.",
    });
}));
// ============================================================
// MODULE 12 — NOTIFICATIONS
// ============================================================
router.get("/notifications", auth, asyncRoute(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const unreadOnly = req.query.unread === "true";
    const where = {};
    if (unreadOnly)
        where.isRead = false;
    if (req.query.type)
        where.type = req.query.type;
    const [notifications, unreadCount] = await Promise.all([
        prisma_1.prisma.platformNotification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
        }),
        prisma_1.prisma.platformNotification.count({ where: { isRead: false } }),
    ]);
    res.json({ notifications, unreadCount });
}));
router.patch("/notifications/:id/read", auth, asyncRoute(async (req, res) => {
    await prisma_1.prisma.platformNotification.update({
        where: { id: String(req.params.id) },
        data: { isRead: true },
    });
    res.json({ success: true });
}));
router.patch("/notifications/read-all", auth, asyncRoute(async (_req, res) => {
    await prisma_1.prisma.platformNotification.updateMany({ data: { isRead: true } });
    res.json({ success: true });
}));
// ============================================================
// MODULE 14 — AUDIT LOGS
// ============================================================
router.get("/audit-logs", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN"), asyncRoute(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const where = {};
    if (req.query.action)
        where.action = req.query.action;
    const [logs, total] = await Promise.all([
        prisma_1.prisma.platformAuditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma_1.prisma.platformAuditLog.count({ where }),
    ]);
    res.json({ logs, total, page, pageSize });
}));
// ============================================================
// MODULE 10 — FORECASTING (scenario projections, not actuals)
// ============================================================
router.get("/forecast", auth, (0, platformAuth_1.requirePlatformRole)("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"), asyncRoute(async (_req, res) => {
    const tokenPrice = await (0, platformSettingsService_1.getTokenPrice)();
    // Editable assumptions (defaults from Module 10 spec)
    const assumptions = {
        avgStudentsPerSchool: 500,
        tokenPrice,
        avgTokensPerStudentPerTerm: (180 / 3) * 1, // spec: 180 tokens per term avg per school — recalculated below
        payingAdoptionRate: 0.7,
        termsPerYear: 3,
        aiCostPerScanNgn: 15,
    };
    // Spec's illustrative table: each school generates 378,000 / (100 × schools)
    // = 3,780 tokens/year revenue gross → per school ~3,780 tokens/year.
    const tokensPerSchoolPerYear = 3780;
    const aiCostPerTokenNgn = assumptions.aiCostPerScanNgn / 1; // illustrative
    const milestones = [10, 25, 50, 100, 200, 300, 500, 750, 1000].map((schools) => {
        const gross = schools * tokensPerSchoolPerYear * tokenPrice;
        const aiCost = schools *
            tokensPerSchoolPerYear *
            (assumptions.aiCostPerScanNgn / 100); // ₦15 per 100 tokens scanned
        return { schools, gross, aiCost, after: gross - aiCost };
    });
    res.json({
        assumptions,
        milestones,
        disclaimer: "These are scenario projections based on the editable assumptions above — NOT actual financial results.",
    });
}));
exports.default = router;
