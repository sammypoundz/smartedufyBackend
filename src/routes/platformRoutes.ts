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
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import {
  platformAuth,
  requirePlatformRole,
  signPlatformToken,
  PlatformAuthRequest,
} from "../middleware/platformAuth";
import { logPlatformActivity } from "../services/platformAuditService";
import {
  tokenWalletService,
  InsufficientBalanceError,
} from "../services/tokenWalletService";
import {
  getTokenPrice,
  setTokenPrice,
} from "../services/platformSettingsService";
import { billingService } from "../services/billingService";
import { notifyPlatform } from "../services/platformNotificationService";
import { logAiUsage } from "../services/aiUsageService";
import { resolvePrivileges } from "./roles";

const router = Router();

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
const daysAgo = (n: number) => {
  const x = startOfDay();
  x.setDate(x.getDate() - n);
  return x;
};

const asyncRoute =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: any, res: Response) => {
    fn(req, res).catch((e: any) => {
      console.error("platform route error:", e.message);
      res
        .status(e.status || 500)
        .json({ error: e.message || "Internal server error" });
    });
  };

const auth = [platformAuth];

// ============================================================
// MODULE 13 — AUTH & USERS
// ============================================================
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/auth/login",
  asyncRoute(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.platformUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !user.isActive)
      return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    await prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await logPlatformActivity({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: "LOGIN",
      description: "Platform console login",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const token = signPlatformToken({
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
  }),
);

router.get(
  "/auth/me",
  auth,
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    res.json(req.platformUser);
  }),
);

const userSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum([
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
    "ONBOARDING_OFFICER",
    "SUPPORT_OFFICER",
    "ANALYTICS_VIEWER",
  ]),
});

router.get(
  "/users",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (_req, res) => {
    const users = await prisma.platformUser.findMany({
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
  }),
);

router.post(
  "/users",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const data = userSchema.parse(req.body);
    const exists = await prisma.platformUser.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (exists) return res.status(409).json({ error: "Email already exists" });
    const user = await prisma.platformUser.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        password: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
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
  }),
);

router.patch(
  "/users/:id",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const target = await prisma.platformUser.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "SUPER_ADMIN" && data.isActive === false) {
      const activeSupers = await prisma.platformUser.count({
        where: { role: "SUPER_ADMIN", isActive: true },
      });
      if (activeSupers <= 1)
        return res
          .status(400)
          .json({ error: "Cannot disable the last active Super Admin" });
    }
    const user = await prisma.platformUser.update({
      where: { id: target.id },
      data,
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "PLATFORM_USER_UPDATE",
      targetType: "PlatformUser",
      targetId: user.id,
      description: `Updated platform user ${user.email}`,
      metadata: data,
      ipAddress: req.ip,
    });
    res.json({ id: user.id, isActive: user.isActive, role: user.role });
  }),
);

// ============================================================
// MODULE 1 — OVERVIEW
// ============================================================
router.get(
  "/overview",
  auth,
  requirePlatformRole(
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
    "ANALYTICS_VIEWER",
    "SUPPORT_OFFICER",
  ),
  asyncRoute(async (_req, res) => {
    const now = new Date();
    const [
      totalSchools,
      activeSchools,
      inactiveSchools,
      newSchools30d,
      totalStudents,
      totalTeachers,
      totalParents,
      subscriptionPaymentsAgg,
      tokenLedgerAgg,
      aiCostAgg,
      subsActive,
      subsExpired,
      plans,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true } }),
      prisma.school.count({ where: { isActive: false } }),
      prisma.school.count({ where: { createdAt: { gte: daysAgo(30) } } }),
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.parent.count(),
      prisma.subscriptionPayment.aggregate({ _sum: { amount: true } }),
      prisma.tokenLedger.aggregate({
        _sum: { amount: true },
        where: { type: "PURCHASE" },
      }),
      prisma.aiUsageLog.aggregate({ _sum: { costNgn: true } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "EXPIRED" } }),
      prisma.subscriptionPlan.findMany({ where: { isActive: true } }),
    ]);

    const totalRevenue =
      (subscriptionPaymentsAgg._sum.amount || 0) +
      (tokenLedgerAgg._sum.amount || 0) * (await getTokenPrice());
    const aiExpenses = aiCostAgg._sum.costNgn || 0;

    // Time-window revenue
    const [monthSub, monthTokens, yearSub, yearTokens] = await Promise.all([
      prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { paidAt: { gte: startOfMonth() } },
      }),
      prisma.tokenLedger.aggregate({
        _sum: { amount: true },
        where: { type: "PURCHASE", createdAt: { gte: startOfMonth() } },
      }),
      prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { paidAt: { gte: startOfYear() } },
      }),
      prisma.tokenLedger.aggregate({
        _sum: { amount: true },
        where: { type: "PURCHASE", createdAt: { gte: startOfYear() } },
      }),
    ]);
    const tokenPrice = await getTokenPrice();

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
        thisMonth:
          (monthSub._sum.amount || 0) +
          (monthTokens._sum.amount || 0) * tokenPrice,
        thisYear:
          (yearSub._sum.amount || 0) +
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
  }),
);

// ============================================================
// MODULE 2 — SCHOOLS
// ============================================================
router.get(
  "/schools",
  auth,
  requirePlatformRole(
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
    "SUPPORT_OFFICER",
    "ONBOARDING_OFFICER",
    "ANALYTICS_VIEWER",
  ),
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25);

    const where: any = {};
    if (q)
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { subdomain: { contains: q, mode: "insensitive" } },
      ];
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        select: {
          id: true,
          name: true,
          subdomain: true,
          isActive: true,
          onboardingRequired: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { students: true, teachers: true, users: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.school.count({ where }),
    ]);

    const schoolIds = schools.map((s) => s.id);
    const [subs, wallets] = await Promise.all([
      prisma.subscription.findMany({
        where: { schoolId: { in: schoolIds } },
        include: { plan: true },
      }),
      prisma.tokenWallet.findMany({ where: { schoolId: { in: schoolIds } } }),
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
                balance: walletMap.get(s.id)!.balance,
                reserved: walletMap.get(s.id)!.reserved,
              }
            : { balance: 0, reserved: 0 },
        };
      }),
    });
  }),
);

// Register a new school (platform action, audited)
const createSchoolSchema = z.object({
  schoolName: z.string().min(2).max(120),
  adminName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z.string().min(8),
});

router.post(
  "/schools",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const data = createSchoolSchema.parse(req.body);
    const exists = await prisma.school.findFirst({
      where: { name: { equals: data.schoolName, mode: "insensitive" } },
    });
    if (exists)
      return res
        .status(409)
        .json({ error: "A school with this name already exists" });
    const emailTaken = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (emailTaken)
      return res.status(409).json({ error: "Admin email already in use" });

    const hashed = await bcrypt.hash(data.password, 10);
    const school = await prisma.school.create({
      data: {
        name: data.schoolName,
        subdomain: data.schoolName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40),
      },
    });
    await prisma.user.create({
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
    await notifyPlatform({
      type: "SCHOOL_REGISTERED",
      title: "New school registered",
      message: `${school.name} was registered by ${req.platformUser!.name}.`,
      schoolId: school.id,
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "SCHOOL_CREATE",
      targetType: "School",
      targetId: school.id,
      description: `Registered new school ${school.name}`,
      ipAddress: req.ip,
    });
    res.status(201).json(school);
  }),
);

router.get(
  "/schools/:id",
  auth,
  requirePlatformRole(
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
    "SUPPORT_OFFICER",
    "ONBOARDING_OFFICER",
    "ANALYTICS_VIEWER",
  ),
  asyncRoute(async (req, res) => {
    const school = await prisma.school.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        name: true,
        subdomain: true,
        isActive: true,
        onboardingRequired: true,
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
    if (!school) return res.status(404).json({ error: "School not found" });

    const [
      subscription,
      wallet,
      subsPayments,
      tokenPurchases,
      tokenCharges,
      aiCosts,
      feeBilled,
      feeCollected,
      recentUsers,
      classes,
      academicYears,
      onboarding,
    ] = await Promise.all([
      prisma.subscription.findUnique({
        where: { schoolId: school.id },
        include: { plan: true },
      }),
      prisma.tokenWallet.findUnique({ where: { schoolId: school.id } }),
      prisma.subscriptionPayment.findMany({
        where: { schoolId: school.id },
        orderBy: { paidAt: "desc" },
        take: 10,
      }),
      prisma.tokenLedger.findMany({
        where: { schoolId: school.id, type: "PURCHASE" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.tokenLedger.findMany({
        where: { schoolId: school.id, type: "CHARGE" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.aiUsageLog.aggregate({
        _sum: { costNgn: true },
        where: { schoolId: school.id },
      }),
      prisma.studentFee.aggregate({
        _sum: { amountAssigned: true },
        where: { schoolId: school.id },
      }),
      prisma.studentFee.aggregate({
        _sum: { amountPaid: true },
        where: { schoolId: school.id },
      }),
      prisma.user.findMany({
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
      prisma.class.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true },
        take: 30,
      }),
      prisma.academicYear.findMany({
        where: { schoolId: school.id, isActive: true },
        select: { name: true },
      }),
      prisma.schoolOnboardingProgress.findUnique({
        where: { schoolId: school.id },
        select: { completedStages: true, currentStage: true, completedAt: true },
      }),
    ]);

    const tokenPrice = await getTokenPrice();
    const schoolFeeBilled = feeBilled._sum.amountAssigned || 0;
    const schoolFeeCollected = feeCollected._sum.amountPaid || 0;
    const tokensPurchased = wallet?.lifetimePurchased || 0;
    const tokensConsumed = wallet?.lifetimeConsumed || 0;

    await logPlatformActivity({
      actorId: (req as PlatformAuthRequest).platformUser!.id,
      actorName: (req as PlatformAuthRequest).platformUser!.name,
      actorRole: (req as PlatformAuthRequest).platformUser!.role,
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
      onboarding: onboarding
        ? {
            completedStages: onboarding.completedStages,
            currentStage: onboarding.currentStage,
            completedAt: onboarding.completedAt,
            done: onboarding.completedStages.length >= 8,
          }
        : null,
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
        platformRevenue:
          subsPayments.reduce((s, p) => s + p.amount, 0) +
          tokensPurchased * tokenPrice,
      },
      operations: {
        activeUsers: recentUsers,
        classList: classes,
        activeAcademicYear: academicYears[0]?.name || null,
      },
    });
  }),
);

router.patch(
  "/schools/:id/status",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({ isActive: z.boolean() });
    const { isActive } = schema.parse(req.body);
    const school = await prisma.school.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!school) return res.status(404).json({ error: "School not found" });
    const updated = await prisma.school.update({
      where: { id: school.id },
      data: { isActive },
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: isActive ? "SCHOOL_ACTIVATE" : "SCHOOL_SUSPEND",
      targetType: "School",
      targetId: school.id,
      description: `${isActive ? "Activated" : "Suspended"} school ${school.name}`,
      ipAddress: req.ip,
    });
    res.json({ id: updated.id, isActive: updated.isActive });
  }),
);

// ---- Impersonate a school admin (login-as) -------------------------------
// Issues a REAL school JWT (same realm /api/auth/login uses) for the school's
// primary ADMIN so the Super Admin lands straight in that school's panel.
// Strictly SUPER_ADMIN only, always audited, and 60-minute expiry so a
// forgotten session cannot linger.
router.post(
  "/schools/:id/impersonate",
  auth,
  requirePlatformRole("SUPER_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const school = await prisma.school.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, name: true, isActive: true },
    });
    if (!school) return res.status(404).json({ error: "School not found" });
    if (!school.isActive)
      return res.status(409).json({ error: "This school is suspended — reactivate it before logging in." });

    // Prefer the school's own ADMIN; fall back to PRINCIPAL.
    const admin =
      (await prisma.user.findFirst({
        where: { schoolId: school.id, role: "ADMIN", isActive: true },
        orderBy: { createdAt: "asc" },
      })) ||
      (await prisma.user.findFirst({
        where: { schoolId: school.id, role: "PRINCIPAL", isActive: true },
        orderBy: { createdAt: "asc" },
      }));
    if (!admin)
      return res.status(404).json({ error: "No active admin account exists for this school." });

    const roles = Array.from(new Set([...(admin.roles || []), admin.role]));
    const rolePrivileges = await resolvePrivileges(school.id, roles);
    const privileges =
      (admin.allowedPages || []).length > 0
        ? Array.from(new Set(admin.allowedPages))
        : rolePrivileges;

    const jwt = (await import("jsonwebtoken")).default;
    const token = jwt.sign(
      {
        id: admin.id,
        role: admin.role,
        roles,
        privileges,
        schoolId: school.id,
        name: admin.name,
        email: admin.email,
        impersonatedBy: req.platformUser!.id, // audit trail inside the token
      },
      process.env.JWT_SECRET!,
      { expiresIn: "60m" },
    );

    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "SCHOOL_IMPERSONATE",
      targetType: "School",
      targetId: school.id,
      description: `Logged in as admin ${admin.email} of ${school.name}`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        roles,
        privileges,
        schoolId: school.id,
      },
      school: { id: school.id, name: school.name },
    });
  }),
);

// Toggle the self-onboarding wizard requirement for a school. When on, the
// school's admin sees the onboarding wizard on every page load until all 8
// stages are complete. ONBOARDING_OFFICER can also toggle it.
router.patch(
  "/schools/:id/onboarding-required",
  auth,
  requirePlatformRole("SUPER_ADMIN", "ONBOARDING_OFFICER"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({ required: z.boolean() });
    const { required } = schema.parse(req.body);
    const school = await prisma.school.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!school) return res.status(404).json({ error: "School not found" });
    const updated = await prisma.school.update({
      where: { id: school.id },
      data: { onboardingRequired: required },
    });
    // When requiring onboarding, make sure a progress row exists so the
    // wizard opens on stage 1 rather than erroring.
    if (required) {
      const p = await prisma.schoolOnboardingProgress.findUnique({
        where: { schoolId: school.id },
      });
      if (!p)
        await prisma.schoolOnboardingProgress.create({ data: { schoolId: school.id } });
    }
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: required ? "ONBOARDING_REQUIRED" : "ONBOARDING_CLEARED",
      targetType: "School",
      targetId: school.id,
      description: required
        ? `Assigned the onboarding wizard to ${school.name}`
        : `Removed the onboarding wizard from ${school.name}`,
      ipAddress: req.ip,
    });
    res.json({ id: updated.id, onboardingRequired: updated.onboardingRequired });
  }),
);

// ============================================================
// MODULE 3 — STUDENT & STAFF ANALYTICS
// ============================================================
router.get(
  "/analytics/students-staff",
  auth,
  requirePlatformRole("SUPER_ADMIN", "ANALYTICS_VIEWER", "SUPPORT_OFFICER"),
  asyncRoute(async (_req, res) => {
    const [
      students,
      teachers,
      parents,
      activeStudents,
      inactiveStudents,
      perSchool,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.parent.count(),
      prisma.student.count({ where: { isActive: true } }),
      prisma.student.count({ where: { isActive: false } }),
      prisma.school.findMany({
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
    const students30 = await prisma.student.findMany({
      where: { createdAt: { gte: daysAgo(30) } },
      select: { createdAt: true },
    });
    const byDay: Record<string, number> = {};
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
  }),
);

// ============================================================
// MODULE 4 — SUBSCRIPTIONS & BILLING
// ============================================================
const planSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  // FIXED = flat monthly fee | FREE = ₦0, no automatic AI allowance | STUDENT_BASED = per-student-per-term
  type: z.enum(["FREE", "FIXED", "STUDENT_BASED"]).default("FIXED"),
  // Monthly recurring price in NGN per school (FIXED type; 0 for FREE)
  monthlyPrice: z.number().min(0).optional(),
  // NGN per eligible student per term (STUDENT_BASED only)
  perStudentRate: z.number().positive().optional(),
  // AI tokens credited per successfully activated paid billing cycle
  aiTokenAllowance: z.number().int().min(0).max(100000).optional(),
  gracePeriodDays: z.number().int().min(0).max(90).optional(),
  maxStudents: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  // Marketing copy shown to schools browsing available plans
  tagline: z.string().max(160).optional(),
  // Feature bullets: [{ label, comingSoon? }]
  features: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        comingSoon: z.boolean().optional(),
      }),
    )
    .max(20)
    .optional(),
  featured: z.boolean().optional(),
});

const CYCLE_MONTHS: Record<string, number> = {
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
] as const;

router.get(
  "/plans",
  auth,
  asyncRoute(async (_req, res) => {
    res.json(
      await prisma.subscriptionPlan.findMany({
        orderBy: { monthlyPrice: "asc" },
      }),
    );
  }),
);

// ---- Canonical billing plans: exactly ONE billing plan exists (Pay Per
// Student). The flat-fee "Subscription" billing type has been scrapped.
// The super admin edits it; creating/deleting billing plans is disabled.
const CANONICAL_PLAN_NAMES = ["Pay Per Student"];

router.get(
  "/plans",
  auth,
  asyncRoute(async (_req, res) => {
    res.json(
      await prisma.subscriptionPlan.findMany({
        orderBy: { monthlyPrice: "asc" },
      }),
    );
  }),
);

// DISABLED: billing plan creation. The product ships with exactly one
// canonical billing plan (Pay Per Student) — see prisma/seedBillingPlans.ts.
// Editing its pricing/copy is done via PUT.
router.post(
  "/plans",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (_req, res) => {
    res.status(403).json({
      error:
        "Billing plans cannot be created. Only the canonical billing plan (Pay Per Student) exists — edit it instead.",
    });
  }),
);

router.put(
  "/plans/:id",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const data = planSchema.partial().parse(req.body);
    // Never allow changing the billing type or name of a canonical plan.
    delete (data as any).type;
    delete (data as any).name;
    // null maxStudents means "no cap" — convert to undefined so Prisma
    // doesn't overwrite the stored value unintentionally? No: null IS the
    // intent (clear the cap), and the column is Int? so null is valid there.
    const plan = await prisma.subscriptionPlan.update({
      where: { id: String(req.params.id) },
      data,
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
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
  }),
);

router.get(
  "/subscriptions",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (_req, res) => {
    const subs = await prisma.subscription.findMany({
      include: { plan: true },
      orderBy: { endDate: "asc" },
    });
    // Resolve school names in bulk (schoolId is a plain ObjectId reference).
    const schoolIds = [...new Set(subs.map((s) => s.schoolId))];
    const schools = await prisma.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true },
    });
    const schoolNameById = new Map(schools.map((sc) => [sc.id, sc.name]));
    const withPayments = await Promise.all(
      subs.map(async (s) => {
        const paid = await prisma.subscriptionPayment.aggregate({
          _sum: { amount: true },
          where: { subscriptionId: s.id, verified: true },
        });
        return {
          ...s,
          totalPaid: paid._sum.amount || 0,
          schoolName: schoolNameById.get(s.schoolId) || "Unknown school",
        };
      }),
    );
    res.json({
      subscriptions: withPayments,
      summary: {
        active: withPayments.filter((s) => s.status === "ACTIVE").length,
        expired: withPayments.filter((s) => s.status === "EXPIRED").length,
        trial: withPayments.filter((s) => s.status === "TRIAL").length,
        pendingRenewal: withPayments.filter(
          (s) => s.status === "PENDING_RENEWAL",
        ).length,
      },
    });
  }),
);

router.post(
  "/subscriptions",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({
      schoolId: z.string(),
      planId: z.string(),
      months: z.number().int().positive().default(1),
      trial: z.boolean().optional(),
      billingCycle: z
        .enum(["MONTHLY", "QUARTERLY", "TERMLY", "HALF_YEARLY", "ANNUAL", "BIENNIALLY"])
        .optional(),
      // Per-school price override for the cycle (server-validated ≥ 0)
      pricePerCycle: z.number().min(0).optional(),
      // Student-based billing: snapshot of eligible students taken NOW at
      // assignment time and locked for the cycle. Change-locked afterwards.
      studentSnapshotCount: z.number().int().min(0).optional(),
      // Token override: super admin decides the bundled tokens at assign time.
      // 0 = no bundled tokens (school tops up itself). Omitted = plan default.
      aiTokenAllowance: z.number().int().min(0).max(100000).optional(),
      schoolTermId: z.string().optional(),
      reason: z.string().max(300).optional(),
    });
    const data = schema.parse(req.body);
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: data.planId },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const school = await prisma.school.findUnique({
      where: { id: data.schoolId },
    });
    if (!school) return res.status(404).json({ error: "School not found" });

    // Server-side pricing — never trust a client-computed total.
    // FREE → ₦0. STUDENT_BASED → snapshot count × per-student rate (count is
    // re-derived server-side unless explicitly overridden with a reason).
    let pricePerCycle = data.pricePerCycle ?? plan.monthlyPrice;
    let studentSnapshotCount = data.studentSnapshotCount;
    if (plan.type === "FREE") pricePerCycle = 0;
    if (plan.type === "STUDENT_BASED") {
      const rate = plan.perStudentRate || 0;
      if (studentSnapshotCount === undefined) {
        // Eligible students = active student profiles in the school NOW.
        studentSnapshotCount = await prisma.student.count({
          where: { schoolId: school.id, isActive: true },
        });
      }
      // Per-student rate drives pricing — ignore any plan/monthly fallback.
      pricePerCycle = studentSnapshotCount * rate;
    }
    if (plan.type === "FIXED" && data.pricePerCycle === undefined) {
      // Use the tier's PlanPriceOverride for the chosen frequency when the
      // super admin didn't force a per-school price.
      const override = await prisma.planPriceOverride.findUnique({
        where: {
          planId_billingFrequency: {
            planId: plan.id,
            billingFrequency: data.billingCycle || "MONTHLY",
          },
        },
      });
      if (override) pricePerCycle = override.price;
    }

    const cycleMonths =
      CYCLE_MONTHS[data.billingCycle || "MONTHLY"] || data.months;
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

    const sub = await prisma.subscription.upsert({
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
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "SUBSCRIPTION_ASSIGN",
      targetType: "Subscription",
      targetId: sub.id,
      description:
        `Assigned ${plan.type} plan ${plan.name} to ${school.name} ` +
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

    // Generate the FIRST invoice right away so the school immediately shows
    // up in the Invoices table with the per-school price that was just set —
    // otherwise it would only appear after a payment lands or a cron run.
    // (FREE plans never get invoices; generateInvoiceForSchool is idempotent
    // on (schoolId, periodKey), so re-running the cron won't duplicate it.)
    let firstInvoice = null;
    if (plan.type !== "FREE") {
      firstInvoice = await billingService
        .generateInvoiceForSchool(school.id, "MANUAL", req.platformUser!.id)
        .catch(() => null);
    }

    res.status(201).json({ ...sub, invoice: firstInvoice });
  }),
);

// Record a verified subscription payment (never marks sub paid without this)
router.post(
  "/subscriptions/payments",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({
      schoolId: z.string(),
      amount: z.number().positive(),
      method: z
        .enum(["TRANSFER", "CARD", "USSD", "CASH", "ADJUSTMENT"])
        .default("TRANSFER"),
      reference: z.string().optional(),
      months: z.number().int().positive().default(1),
      note: z.string().optional(),
      verified: z.boolean().default(true),
    });
    const data = schema.parse(req.body);

    const sub = await prisma.subscription.findUnique({
      where: { schoolId: data.schoolId },
    });
    if (!sub)
      return res
        .status(404)
        .json({ error: "School has no subscription. Assign a plan first." });

    const payment = await prisma.subscriptionPayment.create({
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
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "ACTIVE", endDate: newEnd },
    });

    // Credit the plan's AI token allowance once per verified paid cycle.
    // Honors a per-assignment token override set by the super admin at assign
    // time (0 = no bundled tokens); falls back to the plan's default.
    // Idempotent via the token-ledger unique (schoolId, reference).
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: sub.planId },
    });
    const allowance = Math.max(
      0,
      sub.aiTokenAllowance ?? plan?.aiTokenAllowance ?? 100,
    );
    let aiTokensGranted = 0;
    if (allowance > 0) {
      const ref = `SUB-${payment.id}`; // stable per payment → no double credit
      try {
        await tokenWalletService.purchase(data.schoolId, allowance, ref, {
          note: `Subscription AI allowance — ${plan?.name} (${data.months} cycle)`,
          metadata: { subscriptionPaymentId: payment.id, planId: plan?.id },
        });
        aiTokensGranted = allowance;
        await prisma.subscriptionPayment.update({
          where: { id: payment.id },
          data: { aiTokensGranted },
        });
      } catch (e: any) {
        // A duplicate reference is fine (payment already credited); anything
        // else must not fail the payment itself.
        if (!/already/i.test(e.message)) console.error("allowance credit failed:", e.message);
      }
    }

    await notifyPlatform({
      type: "PAYMENT",
      title: "Subscription payment received",
      message: `₦${data.amount.toLocaleString()} received for subscription renewal.`,
      schoolId: data.schoolId,
      metadata: { amount: data.amount, months: data.months },
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "SUBSCRIPTION_PAYMENT",
      targetType: "Subscription",
      targetId: sub.id,
      description: `Recorded ₦${data.amount} payment (${data.months} month(s)) for subscription`,
      ipAddress: req.ip,
    });
    res.status(201).json(payment);
  }),
);

// ============================================================
// MODULE 5 — REVENUE ANALYTICS
// ============================================================
router.get(
  "/revenue",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"),
  asyncRoute(async (_req, res) => {
    const tokenPrice = await getTokenPrice();
    const [subPayments, tokenPurchases, aiCosts, platformExpenses] =
      await Promise.all([
        prisma.subscriptionPayment.findMany({
          select: { amount: true, paidAt: true, verified: true, method: true },
        }),
        prisma.tokenLedger.findMany({
          where: { type: "PURCHASE" },
          select: { amount: true, createdAt: true },
        }),
        prisma.aiUsageLog.aggregate({ _sum: { costNgn: true } }),
        prisma.platformExpense.aggregate({ _sum: { amount: true } }),
      ]);

    const subRevenue = subPayments
      .filter((p) => p.verified)
      .reduce((s, p) => s + p.amount, 0);
    const tokenRevenue = tokenPurchases.reduce(
      (s, p) => s + p.amount * tokenPrice,
      0,
    );
    const grossRevenue = subRevenue + tokenRevenue;
    const aiExpense = aiCosts._sum.costNgn || 0;
    const otherExpenses = platformExpenses._sum.amount || 0;

    // Monthly series (last 12 months)
    const monthly: Record<string, { subs: number; tokens: number }> = {};
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
    const perSchool = await prisma.subscription.groupBy({
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
        .reduce(
          (acc, p) => {
            acc[p.method] = (acc[p.method] || 0) + p.amount;
            return acc;
          },
          {} as Record<string, number>,
        ),
      monthlySeries: series,
      note: "Revenue includes verified subscription payments and token purchases only. School fee collections are the schools\u2019 own income, NOT platform revenue.",
    });
  }),
);

// ============================================================
// MODULE 6 — SCHOOL FEE ANALYTICS
// ============================================================
router.get(
  "/fees",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"),
  asyncRoute(async (req, res) => {
    const schoolId = req.query.schoolId as string | undefined;
    const where: any = {};
    if (schoolId) where.schoolId = schoolId;

    const perSchool = await prisma.studentFee.groupBy({
      by: ["schoolId"],
      where,
      _sum: { amountAssigned: true, amountPaid: true },
      _count: { studentId: true },
    });

    const schools = await prisma.school.findMany({
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
          collectionRate:
            billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0,
          students: r._count.studentId,
        };
      })
      .sort((a, b) => b.billed - a.billed);

    const totals = rows.reduce(
      (acc, r) => ({
        billed: acc.billed + r.billed,
        collected: acc.collected + r.collected,
        outstanding: acc.outstanding + r.outstanding,
      }),
      { billed: 0, collected: 0, outstanding: 0 },
    );

    res.json({
      totals: {
        ...totals,
        collectionRate:
          totals.billed > 0
            ? Math.round((totals.collected / totals.billed) * 1000) / 10
            : 0,
      },
      perSchool: rows,
      accountingNote:
        "School fees belong to the schools. SmartEdufy records commissions/fees separately as platform revenue.",
    });
  }),
);

// ============================================================
// MODULE 7 — EDUFY WALLET & TOKENS
// ============================================================
router.get(
  "/wallets",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (_req, res) => {
    const wallets = await prisma.tokenWallet.findMany({
      orderBy: { balance: "asc" },
    });
    const schools = await prisma.school.findMany({
      where: { id: { in: wallets.map((w) => w.schoolId) } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    const tokenPrice = await getTokenPrice();

    const [totalPurchased, totalConsumed, consumedToday] = await Promise.all([
      prisma.tokenLedger.aggregate({
        _sum: { amount: true },
        where: { type: "PURCHASE" },
      }),
      prisma.tokenLedger.aggregate({
        _sum: { amount: true },
        where: { type: "CHARGE" },
      }),
      prisma.tokenLedger.aggregate({
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
  }),
);

router.get(
  "/wallets/:schoolId",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (req, res) => {
    const wallet = await tokenWalletService.getWallet(String(req.params.schoolId));
    const ledger = await tokenWalletService.ledger(String(req.params.schoolId), 100);
    const school = await prisma.school.findUnique({
      where: { id: String(req.params.schoolId) },
      select: { name: true },
    });
    res.json({ school: school?.name, wallet, ledger });
  }),
);

router.post(
  "/wallets/:schoolId/purchase",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({
      tokens: z.number().int().positive(),
      reference: z.string().min(3).max(100),
      note: z.string().max(300).optional(),
    });
    const data = schema.parse(req.body);
    const result = await tokenWalletService.purchase(
      String(req.params.schoolId),
      data.tokens,
      data.reference,
      { note: data.note },
    );
    if (!result.duplicate) {
      const school = await prisma.school.findUnique({
        where: { id: String(req.params.schoolId) },
        select: { name: true },
      });
      await notifyPlatform({
        type: "TOKEN_PURCHASE",
        title: "Token purchase recorded",
        message: `${school?.name || "School"} purchased ${data.tokens.toLocaleString()} tokens (₦${(data.tokens * (await getTokenPrice())).toLocaleString()}).`,
        schoolId: String(req.params.schoolId),
        metadata: { tokens: data.tokens },
      });
      await logPlatformActivity({
        actorId: req.platformUser!.id,
        actorName: req.platformUser!.name,
        actorRole: req.platformUser!.role,
        action: "WALLET_PURCHASE",
        targetType: "TokenWallet",
        targetId: String(req.params.schoolId),
        description: `Recorded purchase of ${data.tokens} tokens (ref: ${data.reference})`,
        ipAddress: req.ip,
      });
    }
    res.status(201).json(result);
  }),
);

router.post(
  "/wallets/:schoolId/adjust",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({
      tokens: z
        .number()
        .int()
        .refine((n) => n !== 0, "Adjustment cannot be zero"),
      reason: z.string().min(5, "A reason is required").max(300),
    });
    const data = schema.parse(req.body);
    const ref = `ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await tokenWalletService.adjust(
      String(req.params.schoolId),
      data.tokens,
      data.reason,
      ref,
    );
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "WALLET_ADJUST",
      targetType: "TokenWallet",
      targetId: String(req.params.schoolId),
      description: `Wallet adjusted by ${data.tokens} tokens: ${data.reason}`,
      metadata: { tokens: data.tokens, reason: data.reason },
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  }),
);

router.get(
  "/wallets/:schoolId/ledger",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 50);
    res.json(await tokenWalletService.ledger(String(req.params.schoolId), limit));
  }),
);

// ============================================================
// MODULE 7c — BIA CONNECT token-purchase analytics
// Distinguishes BIA token revenue from subscription revenue.
// ============================================================
router.get(
  "/payments/bia",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (req, res) => {
    const where: any = {};
    if (req.query.schoolId) where.schoolId = String(req.query.schoolId);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }
    const txns = await prisma.biaPaymentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const schoolIds = [...new Set(txns.map((t) => t.schoolId))];
    const schools = await prisma.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));

    const successful = txns.filter((t) => t.fulfilled);
    const byDay: Record<string, number> = {};
    for (const t of successful) {
      const k = (t.paidAt || t.createdAt).toISOString().slice(0, 10);
      byDay[k] = (byDay[k] || 0) + t.amount;
    }
    const bySchool: Record<string, number> = {};
    for (const t of successful) {
      const name = nameMap.get(t.schoolId) || t.schoolId;
      bySchool[name] = (bySchool[name] || 0) + t.amount;
    }
    res.json({
      totals: {
        revenue: successful.reduce((s, t) => s + t.amount, 0),
        successfulCount: successful.length,
        pendingCount: txns.filter((t) => t.status === "PENDING").length,
        failedCount: txns.filter((t) =>
          ["FAILED", "EXPIRED", "REVERSED"].includes(t.status),
        ).length,
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
      note:
        "BIA token-purchase revenue only — subscription revenue is reported separately under /platform/revenue.",
    });
  }),
);

// ============================================================
// MODULE 7b — BILLING: overview, invoices, price overrides,
//             token packages, billing cron
// ============================================================

// ---- Billing overview (KPI strip for the Subscriptions & Billing page) ----
router.get(
  "/billing/overview",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (_req, res) => {
    const [pendingAgg, overdue, paidAgg, invoicesCount, events, upcomingSubs] =
      await Promise.all([
        prisma.invoice.aggregate({
          _sum: { amount: true },
          where: { status: "PENDING" },
        }),
        prisma.invoice.count({
          where: { status: "PENDING", dueDate: { lt: new Date() } },
        }),
        prisma.invoice.aggregate({
          _sum: { paidAmount: true },
          where: { status: "PAID" },
        }),
        prisma.invoice.count(),
        prisma.billingEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.subscription.findMany({
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
  }),
);

// ---- Invoice list (filter by school / status) ----
router.get(
  "/invoices",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (req, res) => {
    const where: any = {};
    if (req.query.schoolId) where.schoolId = String(req.query.schoolId);
    if (req.query.status) where.status = String(req.query.status);
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const schoolIds = Array.from(new Set(invoices.map((i) => i.schoolId)));
    const schools = await prisma.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));
    res.json(
      invoices.map((i) => ({
        ...i,
        schoolName: nameMap.get(i.schoolId) || i.schoolId,
      })),
    );
  }),
);

// ---- Manually generate an invoice for a school (super admin) ----
router.post(
  "/invoices/generate",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({ schoolId: z.string() });
    const { schoolId } = schema.parse(req.body);
    const invoice = await billingService.generateInvoiceForSchool(
      schoolId,
      "MANUAL",
      req.platformUser!.id,
    );
    if (!invoice)
      return res.status(409).json({
        error:
          "No invoice generated — school may have no active paid subscription, or this period is already invoiced.",
      });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "INVOICE_GENERATE",
      targetType: "Invoice",
      targetId: invoice.id,
      description: `Manually generated invoice ${invoice.invoiceNo} (${invoice.amount})`,
      ipAddress: req.ip,
    });
    res.status(201).json(invoice);
  }),
);

// ---- Record a verified invoice payment (extends subscription + tokens) ----
router.post(
  "/invoices/:id/pay",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({
      paymentRef: z.string().min(3).max(100),
      method: z.enum(["TRANSFER", "CARD", "USSD", "CASH"]).default("TRANSFER"),
    });
    const data = schema.parse(req.body);
    const invoice = await billingService.payInvoice(
      String(req.params.id),
      data.paymentRef,
      data.method,
    );
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "INVOICE_PAY",
      targetType: "Invoice",
      targetId: invoice.id,
      description: `Invoice ${invoice.invoiceNo} marked paid (ref ${data.paymentRef})`,
      ipAddress: req.ip,
    });
    res.json(invoice);
  }),
);

// ---- Void an invoice ----
router.post(
  "/invoices/:id/void",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const invoice = await prisma.invoice.update({
      where: { id: String(req.params.id) },
      data: { status: "VOID" },
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "INVOICE_VOID",
      targetType: "Invoice",
      targetId: invoice.id,
      description: `Invoice ${invoice.invoiceNo} voided`,
      ipAddress: req.ip,
    });
    res.json(invoice);
  }),
);

// ---- Per-tier price overrides (read all, upsert one) ----
router.get(
  "/price-overrides",
  auth,
  asyncRoute(async (_req, res) => {
    res.json(await prisma.planPriceOverride.findMany());
  }),
);

router.put(
  "/price-overrides",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({
      planId: z.string(),
      billingFrequency: z.enum([
        "MONTHLY",
        "QUARTERLY",
        "TERMLY",
        "HALF_YEARLY",
        "ANNUAL",
        "BIENNIALLY",
      ]),
      price: z.number().min(0),
    });
    const data = schema.parse(req.body);
    const override = await prisma.planPriceOverride.upsert({
      where: {
        planId_billingFrequency: {
          planId: data.planId,
          billingFrequency: data.billingFrequency,
        },
      },
      update: { price: data.price },
      create: data,
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "PRICE_OVERRIDE_SET",
      targetType: "PlanPriceOverride",
      targetId: override.id,
      description: `${data.billingFrequency} price set to ${data.price}`,
      ipAddress: req.ip,
    });
    res.json(override);
  }),
);

// ---- Token packages CRUD ----
router.get(
  "/token-packages",
  auth,
  asyncRoute(async (_req, res) => {
    res.json(
      await prisma.tokenPackage.findMany({
        orderBy: { sortOrder: "asc" },
      }),
    );
  }),
);

router.post(
  "/token-packages",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).max(50),
      tokens: z.number().int().positive(),
      price: z.number().positive(),
      sortOrder: z.number().int().default(0),
    });
    const data = schema.parse(req.body);
    const pkg = await prisma.tokenPackage.create({ data });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "TOKEN_PACKAGE_CREATE",
      targetType: "TokenPackage",
      targetId: pkg.id,
      description: `Created token package ${pkg.name}: ${pkg.tokens} tokens @ ${pkg.price}`,
      ipAddress: req.ip,
    });
    res.status(201).json(pkg);
  }),
);

router.put(
  "/token-packages/:id",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).max(50).optional(),
      tokens: z.number().int().positive().optional(),
      price: z.number().positive().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    });
    const data = schema.parse(req.body);
    const pkg = await prisma.tokenPackage.update({
      where: { id: String(req.params.id) },
      data,
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "TOKEN_PACKAGE_UPDATE",
      targetType: "TokenPackage",
      targetId: pkg.id,
      description: `Updated token package ${pkg.name}`,
      ipAddress: req.ip,
    });
    res.json(pkg);
  }),
);

router.delete(
  "/token-packages/:id",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const pkg = await prisma.tokenPackage.update({
      where: { id: String(req.params.id) },
      data: { isActive: false },
    });
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "TOKEN_PACKAGE_DEACTIVATE",
      targetType: "TokenPackage",
      targetId: pkg.id,
      description: `Deactivated token package ${pkg.name}`,
      ipAddress: req.ip,
    });
    res.json(pkg);
  }),
);

// ---- Billing cron (manual trigger for ops / testing) ----
router.post(
  "/billing/cron",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const result = await billingService.runBillingCron();
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "BILLING_CRON_MANUAL",
      description: `Manual billing cron: ${JSON.stringify(result)}`,
      ipAddress: req.ip,
    });
    res.json(result);
  }),
);

// ---- Complimentary token grant (subscription split, audited) ----
router.post(
  "/wallets/:schoolId/grant",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res) => {
    const schema = z.object({
      tokens: z.number().int().positive().max(100000),
      note: z.string().min(3).max(300),
    });
    const data = schema.parse(req.body);
    const ref = `GRANT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await tokenWalletService.allocate(
      String(req.params.schoolId),
      data.tokens,
      ref,
      { note: data.note, metadata: { grantedBy: req.platformUser!.id } },
    );
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "WALLET_GRANT",
      targetType: "TokenWallet",
      targetId: String(req.params.schoolId),
      description: `Granted ${data.tokens} subscription tokens: ${data.note}`,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  }),
);

// Token price setting
router.get(
  "/settings/token-price",
  auth,
  asyncRoute(async (_req, res) => {
    res.json({ tokenPrice: await getTokenPrice() });
  }),
);

router.put(
  "/settings/token-price",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req: PlatformAuthRequest, res: Response) => {
    const schema = z.object({ tokenPrice: z.number().positive() });
    const { tokenPrice } = schema.parse(req.body);
    await setTokenPrice(tokenPrice);
    await logPlatformActivity({
      actorId: req.platformUser!.id,
      actorName: req.platformUser!.name,
      actorRole: req.platformUser!.role,
      action: "TOKEN_PRICE_UPDATE",
      description: `Token price set to ₦${tokenPrice}`,
      metadata: { tokenPrice },
      ipAddress: req.ip,
    });
    res.json({ tokenPrice });
  }),
);

// ============================================================
// MODULE 8 — AI USAGE & PROFITABILITY
// ============================================================
router.get(
  "/ai/usage",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"),
  asyncRoute(async (req, res) => {
    const where: any = {};
    if (req.query.schoolId) where.schoolId = req.query.schoolId;
    if (req.query.operation) where.operation = req.query.operation;

    const tokenPrice = await getTokenPrice();
    const [
      total,
      success,
      failed,
      costAgg,
      bySchool,
      byOperation,
      byModel,
      series,
    ] = await Promise.all([
      prisma.aiUsageLog.count({ where }),
      prisma.aiUsageLog.count({ where: { ...where, status: "SUCCESS" } }),
      prisma.aiUsageLog.count({ where: { ...where, status: "FAILED" } }),
      prisma.aiUsageLog.aggregate({
        _sum: {
          costNgn: true,
          revenueNgn: true,
          tokensCharged: true,
          inputTokens: true,
          outputTokens: true,
        },
        where,
      }),
      prisma.aiUsageLog.groupBy({
        by: ["schoolId"],
        where,
        _sum: { costNgn: true, tokensCharged: true, revenueNgn: true },
        _count: { id: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ["operation"],
        where,
        _sum: { costNgn: true, tokensCharged: true },
        _count: { id: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ["model"],
        where,
        _sum: { costNgn: true, inputTokens: true, outputTokens: true },
        _count: { id: true },
      }),
      prisma.aiUsageLog.findMany({
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
    ] as string[];
    const schoolNames = schoolIds.length
      ? await prisma.school.findMany({
          where: { id: { in: schoolIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(schoolNames.map((s) => [s.id, s.name]));

    // Daily cost/revenue series (last 30 days of logs)
    const byDayMap: Record<
      string,
      { cost: number; revenue: number; scans: number; failed: number }
    > = {};
    for (const log of series) {
      const k = log.createdAt.toISOString().slice(0, 10);
      byDayMap[k] = byDayMap[k] || { cost: 0, revenue: 0, scans: 0, failed: 0 };
      byDayMap[k].cost += log.costNgn;
      byDayMap[k].revenue += log.revenueNgn;
      if (log.status === "SUCCESS") byDayMap[k].scans++;
      else byDayMap[k].failed++;
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
        marginPct:
          revenue > 0
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
  }),
);

// ============================================================
// MODULE 16 — TRAFFIC & ACTIVITY MONITOR
// Per-school traffic intelligence assembled entirely from data the platform
// already records (audit logs, e-Pin result-checker redemptions, population
// counts, Cloudinary storage) — no extra instrumentation required.
// ============================================================
router.get(
  "/traffic",
  auth,
  requirePlatformRole("SUPER_ADMIN", "ANALYTICS_VIEWER", "SUPPORT_OFFICER"),
  asyncRoute(async (req, res) => {
    const windowDays = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = daysAgo(windowDays);

    const schools = await prisma.school.findMany({
      select: { id: true, name: true, isActive: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    const schoolIds = schools.map((s) => s.id);

    const [
      schoolUsers,
      activeSince,
      byRoleGroups,
      audit30,
      failedLogins,
      epinChecks,
      topPins,
      hourlyChecks,
      resultCounts,
      authActions,
    ] = await Promise.all([
      // Population per school, split by role — activity KPIs need the base
      prisma.user.groupBy({
        by: ["schoolId", "role"],
        where: { schoolId: { in: schoolIds }, isActive: true },
        _count: { id: true },
      }),
      // Who did ANYTHING in the window (distinct users in audit log)
      prisma.auditLog.findMany({
        where: { schoolId: { in: schoolIds }, createdAt: { gte: since } },
        select: { schoolId: true, userId: true },
        distinct: ["schoolId", "userId"],
      }),
      // Activity per role in the window (who is actually using the system)
      prisma.auditLog.groupBy({
        by: ["schoolId", "userRole"],
        where: { schoolId: { in: schoolIds }, createdAt: { gte: since } },
        _count: { id: true },
      }),
      // Daily action volume per school (traffic trend chart)
      prisma.auditLog.groupBy({
        by: ["schoolId"],
        where: { schoolId: { in: schoolIds }, createdAt: { gte: since } },
        _count: { id: true },
      }),
      // Failed logins in the window — a security/traffic signal
      prisma.auditLog.count({
        where: {
          schoolId: { in: schoolIds },
          action: "LOGIN",
          createdAt: { gte: since },
          description: { not: { in: ["Logged in"] } },
        },
      }),
      // Public result-checker page traffic (e-Pin redemptions)
      prisma.resultEpin.groupBy({
        by: ["schoolId"],
        where: { schoolId: { in: schoolIds }, usedAt: { gte: since } },
        _count: { id: true },
        _sum: { uses: true },
      }),
      // Most frequently checked results platform-wide
      prisma.resultEpin.findMany({
        where: { schoolId: { in: schoolIds }, uses: { gt: 0 } },
        orderBy: { uses: "desc" },
        take: 10,
        include: {
          student: { select: { name: true, admissionNumber: true } },
        },
      }),
      // Hour-of-day distribution of result checks (peak visiting hours)
      prisma.resultEpin.findMany({
        where: { schoolId: { in: schoolIds }, usedAt: { gte: since } },
        select: { usedAt: true, uses: true },
        take: 2000,
        orderBy: { usedAt: "desc" },
      }),
      // School size signals: records created per school
      Promise.all([
        prisma.student.groupBy({
          by: ["schoolId"],
          where: { schoolId: { in: schoolIds } },
          _count: { id: true },
        }),
        prisma.result.groupBy({
          by: ["schoolId"],
          where: { schoolId: { in: schoolIds } },
          _count: { id: true },
        }),
      ]),
      // Logins vs other actions in the window (auth traffic split)
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { schoolId: { in: schoolIds }, createdAt: { gte: since } },
        _count: { id: true },
      }),
    ]);

    // ---- index the grouped data ----
    const popBySchool = new Map<
      string,
      { students: number; staff: number; parents: number; total: number }
    >();
    for (const g of schoolUsers) {
      const cur =
        popBySchool.get(g.schoolId) ||
        { students: 0, staff: 0, parents: 0, total: 0 };
      const n = g._count.id;
      if (g.role === "STUDENT") cur.students += n;
      else if (g.role === "PARENT") cur.parents += n;
      else cur.staff += n; // ADMIN, TEACHER, PRINCIPAL, BURSAR, ...
      cur.total += n;
      popBySchool.set(g.schoolId, cur);
    }

    const activeUsersBySchool = new Map<string, Set<string>>();
    for (const row of activeSince) {
      if (!row.userId) continue;
      const set = activeUsersBySchool.get(row.schoolId) || new Set();
      set.add(row.userId);
      activeUsersBySchool.set(row.schoolId, set);
    }

    const roleActivity = new Map<
      string,
      Map<string, number>
    >();
    for (const g of byRoleGroups) {
      const m = roleActivity.get(g.schoolId) || new Map();
      m.set(g.userRole || "UNKNOWN", g._count.id);
      roleActivity.set(g.schoolId, m);
    }

    const actionsBySchool = new Map(
      audit30.map((g) => [g.schoolId, g._count.id]),
    );
    const checksBySchool = new Map(
      epinChecks.map((g) => [
        g.schoolId,
        { visitors: g._count.id, checks: g._sum.uses || 0 },
      ]),
    );
    const studentsBySchool = new Map(
      resultCounts[0].map((g) => [g.schoolId, g._count.id]),
    );
    const resultsBySchool = new Map(
      resultCounts[1].map((g) => [g.schoolId, g._count.id]),
    );
    const totalActions = authActions.reduce((s, a) => s + a._count.id, 0);
    const loginActions =
      authActions.find((a) => a.action === "LOGIN")?._count.id || 0;

    // Hour-of-day histogram for result-checker visits
    const hourHistogram = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      visits: 0,
    }));
    for (const p of hourlyChecks) {
      if (!p.usedAt) continue;
      hourHistogram[p.usedAt.getHours()].visits += p.uses;
    }

    const rows = schools.map((s) => {
      const pop = popBySchool.get(s.id) ||
        { students: 0, staff: 0, parents: 0, total: 0 };
      const active = activeUsersBySchool.get(s.id)?.size || 0;
      const actions = actionsBySchool.get(s.id) || 0;
      const checks = checksBySchool.get(s.id) || { visitors: 0, checks: 0 };
      const roles = roleActivity.get(s.id) || new Map();
      const roleMap: Record<string, number> = {};
      for (const [k, v] of roles) roleMap[k] = v;
      return {
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        ageDays: Math.floor(
          (Date.now() - s.createdAt.getTime()) / (24 * 60 * 60 * 1000),
        ),
        population: pop,
        activeUsers: active,
        activityRate:
          pop.total > 0
            ? Math.round((active / pop.total) * 100)
            : 0,
        actions,
        actionsPerUser: active > 0 ? Math.round(actions / active) : 0,
        resultChecker: {
          visitors: checks.visitors,
          checks: checks.checks,
          visitorsPerStudent:
            pop.students > 0
              ? Math.round((checks.visitors / pop.students) * 100)
              : 0,
        },
        activityByRole: roleMap,
        size: {
          students: studentsBySchool.get(s.id) || 0,
          results: resultsBySchool.get(s.id) || 0,
        },
      };
    });

    // Platform-wide roll-up
    const totals = rows.reduce(
      (a, r) => ({
        users: a.users + r.population.total,
        activeUsers: a.activeUsers + r.activeUsers,
        actions: a.actions + r.actions,
        resultChecks: a.resultChecks + r.resultChecker.checks,
        resultVisitors: a.resultVisitors + r.resultChecker.visitors,
      }),
      {
        users: 0,
        activeUsers: 0,
        actions: 0,
        resultChecks: 0,
        resultVisitors: 0,
      },
    );

    await logPlatformActivity({
      actorId: (req as PlatformAuthRequest).platformUser!.id,
      actorName: (req as PlatformAuthRequest).platformUser!.name,
      actorRole: (req as PlatformAuthRequest).platformUser!.role,
      action: "TRAFFIC_VIEW",
      description: `Viewed traffic & activity monitor (${windowDays}-day window)`,
      ipAddress: req.ip,
    });

    res.json({
      windowDays,
      totals: {
        ...totals,
        activityRate:
          totals.users > 0
            ? Math.round((totals.activeUsers / totals.users) * 100)
            : 0,
        loginShare:
          totalActions > 0
            ? Math.round((loginActions / totalActions) * 100)
            : 0,
      },
      activityByAction: authActions
        .map((a) => ({ action: a.action, count: a._count.id }))
        .sort((a, b) => b.count - a.count),
      resultCheckerHours: hourHistogram,
      topCheckedResults: topPins.map((p) => ({
        schoolId: p.schoolId,
        studentName: p.student.name,
        admissionNumber: p.student.admissionNumber,
        term: p.term,
        uses: p.uses,
        lastUsedAt: p.usedAt,
      })),
      schools: rows.sort((a, b) => b.actions - a.actions),
    });
  }),
);

// ============================================================
// MODULE 16b — STORAGE, DISK & BANDWIDTH
// Per-school file footprint (Cloudinary assets per school subfolder) plus
// account-level server disk & delivery bandwidth from Cloudinary's usage
// API, and real per-school API bandwidth from the BandwidthStat counters.
// ============================================================
router.get(
  "/storage",
  auth,
  requirePlatformRole("SUPER_ADMIN", "ANALYTICS_VIEWER"),
  asyncRoute(async (req, res) => {
    const cloud = (await import("../config/cloudinary")).default;
    const FOLDER = "smartedufy";

    const since = daysAgo(30);
    const dateKeys: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = daysAgo(i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }

    // Cloudinary subfolders are per-school: smartedufy/<schoolId>/...
    // Wrapped so a missing/unreachable Cloudinary config degrades to empty
    // per-school file counts instead of a 500 (API bandwidth still returns).
    let folderNames: string[] = [];
    try {
      const subfolders = await cloud.api.sub_folders(FOLDER, { max_results: 500 });
      folderNames = (subfolders.folders || []).map((f: any) => f.name);
    } catch {
      folderNames = []; // not configured / network error — degrade gracefully
    }

    const schools = await prisma.school.findMany({
      select: { id: true, name: true },
    });
    const nameMap = new Map(schools.map((s) => [s.id, s.name]));

    const perSchool: {
      schoolId: string;
      schoolName: string;
      files: number;
      bytes: number;
    }[] = [];
    let platformFiles = 0;
    let platformBytes = 0;

    for (const fname of folderNames) {
      const schoolId = fname.split("/").pop() as string;
      let resources: any = { resources: [], next_cursor: undefined };
      let files = 0;
      let bytes = 0;
      do {
        resources = await cloud.api.resources_by_asset_folder(fname, {
          max_results: 500,
          next_cursor: resources.next_cursor,
        });
        for (const r of resources.resources || []) {
          files++;
          bytes += r.bytes || 0;
        }
      } while (resources.next_cursor);
      const known = nameMap.has(schoolId);
      if (known) {
        perSchool.push({ schoolId, schoolName: nameMap.get(schoolId)!, files, bytes });
      } else {
        platformFiles += files;
        platformBytes += bytes;
      }
    }

    // Cloudinary account-level usage: real server disk space and the last
    // 30 days' delivery bandwidth (what the CDN served). Bandwidth history
    // is limited to the current billing period by the API — max_bandwidth
    // is the period cap and bandwidth_used the consumption so far.
    let cloudinaryUsage: any = null;
    try {
      cloudinaryUsage = await cloud.api.usage();
    } catch {
      cloudinaryUsage = null; // not configured / network error — degrade gracefully
    }

    // Real per-school API bandwidth (last 30 days) from the counters
    const bwRows = await prisma.bandwidthStat.findMany({
      where: {
        schoolId: { in: [...nameMap.keys()] },
        date: { in: dateKeys },
      },
    });
    const bwBySchool = new Map<string, { bytes: number; requests: number }>();
    for (const row of bwRows) {
      const cur = bwBySchool.get(row.schoolId) || { bytes: 0, requests: 0 };
      cur.bytes += row.bytes;
      cur.requests += row.requests;
      bwBySchool.set(row.schoolId, cur);
    }

    // Daily platform-wide API bandwidth series (last 30 days)
    const dailyBw = await prisma.bandwidthStat.groupBy({
      by: ["date"],
      where: { date: { in: dateKeys } },
      _sum: { bytes: true, requests: true },
    });

    perSchool.sort((a, b) => b.bytes - a.bytes);
    const totalStorageBytes =
      perSchool.reduce((s, r) => s + r.bytes, 0) + platformBytes;

    const merged = schools.map((s) => {
      const files = perSchool.find((p) => p.schoolId === s.id);
      const bw = bwBySchool.get(s.id) || { bytes: 0, requests: 0 };
      return {
        schoolId: s.id,
        schoolName: s.name,
        files: files?.files || 0,
        storageBytes: files?.bytes || 0,
        apiBytes: bw.bytes,
        apiRequests: bw.requests,
      };
    });
    merged.sort((a, b) => b.storageBytes - a.storageBytes);

    await logPlatformActivity({
      actorId: (req as PlatformAuthRequest).platformUser!.id,
      actorName: (req as PlatformAuthRequest).platformUser!.name,
      actorRole: (req as PlatformAuthRequest).platformUser!.role,
      action: "STORAGE_VIEW",
      description: "Viewed storage, disk & bandwidth monitor",
    });

    res.json({
      // Cloudinary account-level (the actual server disk & CDN bandwidth)
      cloudinary: cloudinaryUsage
        ? {
            storageUsedBytes: cloudinaryUsage.storage?.usage || 0,
            storageLimitBytes: cloudinaryUsage.storage?.limit || null,
            bandwidthUsedBytes: cloudinaryUsage.bandwidth?.usage || 0,
            bandwidthLimitBytes: cloudinaryUsage.bandwidth?.limit || null,
            objects: cloudinaryUsage.objects || 0,
            updatedAt: cloudinaryUsage.updated_at || null,
          }
        : null,
      // Per-school merged view (last 30 days for API bandwidth)
      perSchool: merged,
      platformFiles,
      platformBytes,
      totalStorageBytes,
      totalApiBytes: merged.reduce((s, r) => s + r.apiBytes, 0),
      totalApiRequests: merged.reduce((s, r) => s + r.apiRequests, 0),
      dailyApiSeries: dailyBw
        .map((d) => ({
          date: d.date,
          bytes: d._sum.bytes || 0,
          requests: d._sum.requests || 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }),
);

// ============================================================
// MODULE 11 — SYSTEM HEALTH
// ============================================================
router.get(
  "/system/health",
  auth,
  requirePlatformRole("SUPER_ADMIN", "SUPPORT_OFFICER"),
  asyncRoute(async (_req, res) => {
    // DB connectivity
    let dbStatus = "UP";
    try {
      await prisma.$runCommandRaw({ ping: 1 });
    } catch {
      dbStatus = "DOWN";
    }

    const [schools, failedSyncs, recentSyncs, failedAis] = await Promise.all([
      prisma.school.count(),
      prisma.syncLog.count({
        where: { status: "FAILED", createdAt: { gte: daysAgo(7) } },
      }),
      prisma.syncLog.findMany({
        where: { createdAt: { gte: daysAgo(30) } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.aiUsageLog.count({
        where: { status: "FAILED", createdAt: { gte: daysAgo(7) } },
      }),
    ]);

    const lastSyncPerSchool: Record<string, string | null> = {};
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
  }),
);

// ============================================================
// MODULE 12 — NOTIFICATIONS
// ============================================================
router.get(
  "/notifications",
  auth,
  asyncRoute(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const unreadOnly = req.query.unread === "true";
    const where: any = {};
    if (unreadOnly) where.isRead = false;
    if (req.query.type) where.type = req.query.type;
    const [notifications, unreadCount] = await Promise.all([
      prisma.platformNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.platformNotification.count({ where: { isRead: false } }),
    ]);
    res.json({ notifications, unreadCount });
  }),
);

router.patch(
  "/notifications/:id/read",
  auth,
  asyncRoute(async (req, res) => {
    await prisma.platformNotification.update({
      where: { id: String(req.params.id) },
      data: { isRead: true },
    });
    res.json({ success: true });
  }),
);

router.patch(
  "/notifications/read-all",
  auth,
  asyncRoute(async (_req, res) => {
    await prisma.platformNotification.updateMany({ data: { isRead: true } });
    res.json({ success: true });
  }),
);

// ============================================================
// MODULE 14 — AUDIT LOGS
// ============================================================
router.get(
  "/audit-logs",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN"),
  asyncRoute(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const where: any = {};
    if (req.query.action) where.action = req.query.action;
    const [logs, total] = await Promise.all([
      prisma.platformAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.platformAuditLog.count({ where }),
    ]);
    res.json({ logs, total, page, pageSize });
  }),
);

// ============================================================
// MODULE 10 — FORECASTING (scenario projections, not actuals)
// ============================================================
router.get(
  "/forecast",
  auth,
  requirePlatformRole("SUPER_ADMIN", "FINANCE_ADMIN", "ANALYTICS_VIEWER"),
  asyncRoute(async (_req, res) => {
    const tokenPrice = await getTokenPrice();
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

    const milestones = [10, 25, 50, 100, 200, 300, 500, 750, 1000].map(
      (schools) => {
        const gross = schools * tokensPerSchoolPerYear * tokenPrice;
        const aiCost =
          schools *
          tokensPerSchoolPerYear *
          (assumptions.aiCostPerScanNgn / 100); // ₦15 per 100 tokens scanned
        return { schools, gross, aiCost, after: gross - aiCost };
      },
    );

    res.json({
      assumptions,
      milestones,
      disclaimer:
        "These are scenario projections based on the editable assumptions above — NOT actual financial results.",
    });
  }),
);

export default router;

