/**
 * Seeds the FIVE canonical billing plans:
 *   1. "Free"             (FREE)           — ₦0, school management only
 *   2. "Pay Per Student"  (STUDENT_BASED)  — ₦ per eligible student per term
 *   3. "Standard"         (FIXED)          — 1–500 students
 *   4. "Growth"           (FIXED)          — 501–2,000 students
 *   5. "Enterprise"       (FIXED)          — 2,000+ students
 *
 * Fixed tiers are priced per billing frequency via PlanPriceOverride rows:
 * MONTHLY | QUARTERLY | TERMLY | HALF_YEARLY | ANNUAL | BIENNIALLY.
 *
 * Also seeds the default AI token packages (schools buy these top-ups).
 *
 * Any other SubscriptionPlan rows (legacy "Subscription", basic/fixed rows)
 * are deactivated so they can no longer be assigned or shown.
 *
 * Product model:
 *   - School management is FREE until the platform assigns a paid plan.
 *   - Edufy AI is NEVER free: it is gated by the school's token wallet —
 *     schools buy AI tokens themselves regardless of plan.
 *
 * Run: npx ts-node prisma/seedBillingPlans.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Per-tier, per-frequency prices (NGN).
const TIER_PRICES: Record<
  string,
  { MONTHLY: number; QUARTERLY: number; TERMLY: number; HALF_YEARLY: number; ANNUAL: number; BIENNIALLY: number }
> = {
  Standard: {
    MONTHLY: 25000,
    QUARTERLY: 70000,
    TERMLY: 70000,
    HALF_YEARLY: 130000,
    ANNUAL: 250000,
    BIENNIALLY: 480000,
  },
  Growth: {
    MONTHLY: 60000,
    QUARTERLY: 170000,
    TERMLY: 170000,
    HALF_YEARLY: 320000,
    ANNUAL: 600000,
    BIENNIALLY: 1150000,
  },
  Enterprise: {
    MONTHLY: 150000,
    QUARTERLY: 430000,
    TERMLY: 430000,
    HALF_YEARLY: 820000,
    ANNUAL: 1500000,
    BIENNIALLY: 2900000,
  },
};

const CANONICAL: {
  name: string;
  type: "FREE" | "STUDENT_BASED" | "FIXED";
  monthlyPrice: number;
  perStudentRate?: number;
  aiTokenAllowance: number;
  maxStudents?: number | null;
  description: string;
  tagline: string;
  featured?: boolean;
}[] = [
  {
    name: "Free",
    type: "FREE",
    monthlyPrice: 0,
    aiTokenAllowance: 0,
    maxStudents: null,
    description: "School management essentials at no cost. Upgrade any time.",
    tagline: "Get started free — no card needed.",
  },
  {
    name: "Pay Per Student",
    type: "STUDENT_BASED",
    monthlyPrice: 0,
    perStudentRate: 200,
    aiTokenAllowance: 0,
    maxStudents: null,
    description:
      "Pay per eligible student per term — priced from an enrolled-student snapshot each billing cycle.",
    tagline: "Ideal for schools that prefer to pay per enrolled student.",
  },
  {
    name: "Standard",
    type: "FIXED",
    monthlyPrice: TIER_PRICES.Standard.MONTHLY,
    aiTokenAllowance: 100,
    maxStudents: 500,
    description: "Flat-fee plan for small schools (1–500 students).",
    tagline: "Everything a small school needs, one flat price.",
  },
  {
    name: "Growth",
    type: "FIXED",
    monthlyPrice: TIER_PRICES.Growth.MONTHLY,
    aiTokenAllowance: 300,
    maxStudents: 2000,
    description: "Flat-fee plan for growing schools (501–2,000 students).",
    tagline: "Scale without per-student surprises.",
    featured: true,
  },
  {
    name: "Enterprise",
    type: "FIXED",
    monthlyPrice: TIER_PRICES.Enterprise.MONTHLY,
    aiTokenAllowance: 1000,
    maxStudents: null,
    description: "Flat-fee plan for large schools & groups (2,000+ students).",
    tagline: "Unlimited students, priority support.",
  },
];

  // Base rate: ₦100/token (Starter = 100 × ₦100, no discount).
  // Flat 2% discount on anything above the 100-token base pack.
  const TOKEN_PACKAGES = [
    { name: "Starter", tokens: 100, price: 10000, sortOrder: 1 },
    { name: "Standard", tokens: 500, price: 49000, sortOrder: 2 },
    { name: "Bulk", tokens: 2000, price: 196000, sortOrder: 3 },
    { name: "Mega", tokens: 5000, price: 490000, sortOrder: 4 },
  ];

async function main() {
  for (const plan of CANONICAL) {
    const row = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        type: plan.type,
        monthlyPrice: plan.monthlyPrice,
        perStudentRate: plan.perStudentRate ?? null,
        aiTokenAllowance: plan.aiTokenAllowance,
        maxStudents: plan.maxStudents ?? null,
        description: plan.description,
        tagline: plan.tagline,
        isActive: true,
        featured: plan.featured ?? false,
      },
      create: {
        name: plan.name,
        type: plan.type,
        monthlyPrice: plan.monthlyPrice,
        perStudentRate: plan.perStudentRate ?? null,
        aiTokenAllowance: plan.aiTokenAllowance,
        maxStudents: plan.maxStudents ?? null,
        description: plan.description,
        tagline: plan.tagline,
        isActive: true,
        featured: plan.featured ?? false,
      },
    });
    console.log(`✔ ensured canonical plan: ${plan.name} (${plan.type})`);

    // Price overrides for fixed tiers (and a ₦0 override for Free).
    if (plan.type === "FIXED" || plan.type === "FREE") {
      const prices =
        plan.type === "FREE"
          ? { MONTHLY: 0, QUARTERLY: 0, TERMLY: 0, HALF_YEARLY: 0, ANNUAL: 0, BIENNIALLY: 0 }
          : TIER_PRICES[plan.name];
      for (const [frequency, price] of Object.entries(prices)) {
        await prisma.planPriceOverride.upsert({
          where: {
            planId_billingFrequency: { planId: row.id, billingFrequency: frequency },
          },
          update: { price },
          create: { planId: row.id, billingFrequency: frequency, price },
        });
      }
      console.log(`  ✔ price overrides for ${plan.name} (${Object.keys(prices).length} frequencies)`);
    }
  }

  // Default token packages.
  for (const pkg of TOKEN_PACKAGES) {
    await prisma.tokenPackage.upsert({
      where: { name: pkg.name },
      update: { tokens: pkg.tokens, price: pkg.price, sortOrder: pkg.sortOrder, isActive: true },
      create: pkg,
    });
  }
  console.log(`✔ ensured ${TOKEN_PACKAGES.length} token packages`);

  // Deactivate anything that isn't canonical.
  const removed = await prisma.subscriptionPlan.updateMany({
    where: { name: { notIn: CANONICAL.map((p) => p.name) } },
    data: { isActive: false },
  });
  console.log(`✔ deactivated ${removed.count} non-canonical plan(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
