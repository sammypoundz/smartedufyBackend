"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingService = void 0;
// ============================================================
// BILLING SERVICE — invoices, renewal cron & token allocation sweeps
// ============================================================
// Runs periodically (wired into server.ts). Responsibilities:
//  1. Invoice generation: PPS schools get a termly invoice priced from a
//     student-count SNAPSHOT; fixed-tier schools get an invoice from the
//     plan's price override for their billing frequency.
//  2. Subscription expiry sweeps: mark expired subscriptions EXPIRED and
//     stop further subscription-token allocations (purchased tokens stay).
//  3. Token allocation sweeps: grant subscription tokens exactly once per
//     allocation period — idempotency enforced by the BillingEvent unique
//     (schoolId, eventKey) AND the token ledger unique (schoolId, reference).
//
// Design notes:
//  - Every mutation is keyed so re-running the cron can never double-invoice
//    or double-allocate.
//  - Free accounts NEVER expire and NEVER generate subscription invoices.
const prisma_1 = require("../config/prisma");
const tokenWalletService_1 = require("./tokenWalletService");
const platformNotificationService_1 = require("./platformNotificationService");
const platformAuditService_1 = require("./platformAuditService");
const CYCLE_MONTHS = {
    MONTHLY: 1,
    QUARTERLY: 3,
    TERMLY: 4,
    HALF_YEARLY: 6,
    ANNUAL: 12,
    ANNUALLY: 12,
    BIENNIALLY: 24,
};
/** Period key used for invoice dedup (per school + billing cycle). */
function periodKeyFor(frequency, date = new Date()) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    switch (frequency) {
        case "MONTHLY":
            return `${y}-${String(m + 1).padStart(2, "0")}`;
        case "QUARTERLY":
            return `${y}-Q${Math.floor(m / 3) + 1}`;
        case "TERMLY": {
            // Nigerian school terms: T1 Sep–Dec, T2 Jan–Mar, T3 Apr–Jul/Aug
            const term = m >= 8 ? "T1" : m <= 2 ? "T2" : "T3";
            return `${y}-${term}`;
        }
        case "HALF_YEARLY":
            return `${y}-H${m < 6 ? 1 : 2}`;
        case "ANNUAL":
        case "ANNUALLY":
            return `${y}`;
        case "BIENNIALLY":
            return `${y}-${Math.floor(y / 2) * 2 + 2}`;
        default:
            return `${y}-${String(m + 1).padStart(2, "0")}`;
    }
}
function addCycle(date, frequency) {
    const months = CYCLE_MONTHS[frequency] || 1;
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}
exports.billingService = {
    periodKeyFor,
    addCycle,
    /**
     * Generate the current-cycle invoice for a school's subscription if one
     * doesn't already exist. Returns the invoice, or null when nothing is due
     * (FREE plans, or an invoice already generated for this period).
     * Safe to call repeatedly — idempotent on (schoolId, periodKey).
     */
    async generateInvoiceForSchool(schoolId, source = "AUTO", createdBy) {
        const sub = await prisma_1.prisma.subscription.findUnique({
            where: { schoolId },
            include: { plan: true },
        });
        if (!sub)
            return null;
        const plan = sub.plan;
        if (plan.type === "FREE")
            return null; // free accounts never get invoices
        if (sub.status === "EXPIRED" || sub.status === "SUSPENDED")
            return null;
        const frequency = sub.billingCycle;
        const periodKey = periodKeyFor(frequency);
        const existing = await prisma_1.prisma.invoice.findUnique({
            where: { schoolId_periodKey: { schoolId, periodKey } },
        });
        if (existing)
            return existing;
        let amount = sub.pricePerCycle ?? plan.monthlyPrice;
        let studentSnapshot = null;
        let pricePerStudent = null;
        let description = `${plan.name} — ${frequency.toLowerCase()} subscription`;
        if (plan.type === "FIXED" && sub.pricePerCycle == null) {
            // Resolve the tier's configured price for this billing frequency.
            const override = await prisma_1.prisma.planPriceOverride.findUnique({
                where: {
                    planId_billingFrequency: {
                        planId: plan.id,
                        billingFrequency: frequency === "ANNUALLY" ? "ANNUAL" : frequency,
                    },
                },
            });
            if (override) {
                amount = override.price;
                description = `${plan.name} — ₦${override.price.toLocaleString()} ${frequency.toLowerCase()}`;
            }
        }
        if (plan.type === "STUDENT_BASED") {
            // Student-count SNAPSHOT captured at invoice generation. Later
            // enrolment changes never modify an existing invoice; the next cycle
            // picks up the new population.
            studentSnapshot = await prisma_1.prisma.student.count({
                where: { schoolId, isActive: true },
            });
            // Per-school override (set by super admin) takes precedence over plan rate
            pricePerStudent = sub.perStudentRateOverride ?? plan.perStudentRate ?? 0;
            amount = studentSnapshot * pricePerStudent;
            description = `${plan.name} — ${studentSnapshot} students × ₦${pricePerStudent.toLocaleString()} (${frequency.toLowerCase()})`;
            await prisma_1.prisma.subscription.update({
                where: { id: sub.id },
                data: { studentSnapshotCount: studentSnapshot },
            });
        }
        const seq = Date.now().toString().slice(-6);
        const invoiceNo = `INV-${new Date().getFullYear()}-${seq}${Math.floor(Math.random() * 90 + 10)}`;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        const invoice = await prisma_1.prisma.invoice.create({
            data: {
                invoiceNo,
                schoolId,
                subscriptionId: sub.id,
                periodKey,
                billingModel: plan.type === "STUDENT_BASED" ? "PAY_PER_STUDENT" : "FIXED_SUBSCRIPTION",
                billingFrequency: frequency,
                description,
                studentSnapshot,
                pricePerStudent,
                amount,
                dueDate,
                status: "PENDING",
                source,
                createdBy,
            },
        });
        await prisma_1.prisma.billingEvent.create({
            data: {
                schoolId,
                type: "INVOICE_GENERATED",
                eventKey: `INVOICE-${invoice.id}`,
                description: `Invoice ${invoiceNo} generated for ₦${amount.toLocaleString()}`,
                metadata: { invoiceId: invoice.id, periodKey, amount, studentSnapshot },
            },
        }).catch(() => undefined); // eventKey collision = duplicate cron run
        return invoice;
    },
    /**
     * Record a verified payment for an invoice and activate/extend the
     * subscription + credit bundled tokens exactly once (ledger idempotency).
     */
    async payInvoice(invoiceId, paymentRef, method = "TRANSFER") {
        const invoice = await prisma_1.prisma.invoice.findUnique({
            where: { id: invoiceId },
        });
        if (!invoice)
            throw new Error("Invoice not found");
        if (invoice.status === "PAID")
            return invoice; // idempotent
        const sub = invoice.subscriptionId
            ? await prisma_1.prisma.subscription.findUnique({ where: { id: invoice.subscriptionId }, include: { plan: true } })
            : await prisma_1.prisma.subscription.findUnique({ where: { schoolId: invoice.schoolId }, include: { plan: true } });
        if (!sub)
            throw new Error("No subscription for invoice");
        const base = sub.endDate > new Date() ? sub.endDate : new Date();
        const newEnd = addCycle(base, sub.billingCycle);
        await prisma_1.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "ACTIVE", endDate: newEnd },
        });
        const updatedInvoice = await prisma_1.prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                status: "PAID",
                paidAt: new Date(),
                paymentRef,
                paidAmount: invoice.amount,
            },
        });
        // Credit the bundled token allowance once per verified paid cycle.
        const allowance = Math.max(0, sub.aiTokenAllowance ?? sub.plan.aiTokenAllowance ?? 0);
        if (allowance > 0) {
            await tokenWalletService_1.tokenWalletService
                .allocate(invoice.schoolId, allowance, `SUB-${paymentRef}`, {
                note: `Subscription token allocation — ${sub.plan.name} (${sub.billingCycle})`,
                metadata: { invoiceId: invoice.id, paymentRef },
            })
                .catch(() => undefined); // duplicate reference = already credited
        }
        await prisma_1.prisma.billingEvent.create({
            data: {
                schoolId: invoice.schoolId,
                type: "PAYMENT_RECORDED",
                eventKey: `PAY-${paymentRef}`,
                description: `Invoice ${invoice.invoiceNo} paid — ₦${invoice.amount.toLocaleString()} (${method})`,
                metadata: { invoiceId: invoice.id, paymentRef, method },
            },
        }).catch(() => undefined);
        return updatedInvoice;
    },
    /**
     * Allocation sweep — grants subscription tokens to every ACTIVE
     * subscription whose plan includes an allowance, exactly once per month.
     * Annual/biennial subscribers keep receiving monthly tokens while active.
     */
    async sweepTokenAllocations() {
        const subs = await prisma_1.prisma.subscription.findMany({
            where: { status: "ACTIVE" },
            include: { plan: true },
        });
        let allocated = 0;
        for (const sub of subs) {
            const allowance = sub.aiTokenAllowance ?? sub.plan.aiTokenAllowance;
            if (!allowance || allowance <= 0)
                continue;
            const monthKey = new Date().toISOString().slice(0, 7);
            const eventKey = `SUB-ALLOC-${sub.id}-${monthKey}`;
            const created = await prisma_1.prisma.billingEvent
                .create({
                data: {
                    schoolId: sub.schoolId,
                    type: "TOKENS_ALLOCATED",
                    eventKey,
                    description: `${allowance} subscription tokens allocated for ${monthKey}`,
                    metadata: { allowance, monthKey, subscriptionId: sub.id },
                },
            })
                .catch(() => null);
            if (!created)
                continue; // already allocated this month (or duplicate run)
            const result = await tokenWalletService_1.tokenWalletService
                .allocate(sub.schoolId, allowance, eventKey, {
                note: `Monthly subscription allocation (${monthKey})`,
                metadata: { subscriptionId: sub.id },
            })
                .catch(() => null);
            if (result && !result.duplicate)
                allocated++;
        }
        return allocated;
    },
    /**
     * Expiry + renewal cron:
     *  - Marks ACTIVE subscriptions past their endDate as EXPIRED (records a
     *    billing event; purchased tokens are never touched).
     *  - Generates invoices for ACTIVE/PENDING_RENEWAL paid subscriptions whose
     *    cycle has come due (auto mode).
     *  - Runs the token allocation sweep.
     */
    async runBillingCron() {
        const now = new Date();
        let expired = 0;
        let invoices = 0;
        // 1. Expire overdue subscriptions
        const stale = await prisma_1.prisma.subscription.findMany({
            where: { status: "ACTIVE", endDate: { lt: now } },
        });
        for (const sub of stale) {
            const created = await prisma_1.prisma.billingEvent
                .create({
                data: {
                    schoolId: sub.schoolId,
                    type: "SUBSCRIPTION_EXPIRED",
                    eventKey: `EXPIRED-${sub.id}-${sub.endDate.toISOString().slice(0, 10)}`,
                    description: `Subscription expired on ${sub.endDate.toISOString().slice(0, 10)} — subscription token allocations stopped`,
                },
            })
                .catch(() => null);
            if (!created)
                continue;
            await prisma_1.prisma.subscription.update({
                where: { id: sub.id },
                data: { status: "EXPIRED" },
            });
            expired++;
            (0, platformNotificationService_1.notifyPlatform)({
                type: "SUBSCRIPTION_EXPIRED",
                title: "Subscription expired",
                message: `A school subscription expired. Generate/renew to restore bundled tokens.`,
                schoolId: sub.schoolId,
            }).catch(() => undefined);
        }
        // 2. Auto-invoice ACTIVE paid subscriptions for the current period
        const due = await prisma_1.prisma.subscription.findMany({
            where: { status: "ACTIVE" },
            include: { plan: true },
        });
        for (const sub of due) {
            if (sub.plan.type === "FREE")
                continue;
            const invoice = await exports.billingService
                .generateInvoiceForSchool(sub.schoolId, "AUTO")
                .catch(() => null);
            if (invoice)
                invoices++;
        }
        // 3. Token allocation sweep (exactly-once per month per subscription)
        const allocated = await exports.billingService.sweepTokenAllocations().catch(() => 0);
        if (expired || invoices || allocated) {
            (0, platformAuditService_1.logPlatformActivity)({
                actorId: "system",
                actorName: "Billing Cron",
                actorRole: "SYSTEM",
                action: "BILLING_CRON",
                description: `Billing cron: ${expired} expired, ${invoices} invoices generated, ${allocated} allocations`,
            }).catch(() => undefined);
        }
        return { expired, invoices, allocated };
    },
};
