/**
 * Ensures the platform has EXACTLY the two canonical billing plans:
 *   1. "Pay Per Student"  (STUDENT_BASED) — ₦ per eligible student per term
 *   2. "Subscription"     (FIXED)         — flat ₦ per billing cycle
 *
 * The super admin only EDITS these two; creating new billing plans is not
 * part of the product. Any other SubscriptionPlan rows are deactivated so
 * they can no longer be assigned or shown.
 *
 * Run: npx ts-node prisma/seedBillingPlans.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANONICAL = [
  {
    name: "Pay Per Student",
    type: "STUDENT_BASED",
    monthlyPrice: 0,
    perStudentRate: 200,
    aiTokenAllowance: 100,
    description:
      "Pay per eligible student per term — priced from an enrolled-student snapshot each billing cycle.",
    tagline: "Ideal for schools that prefer to pay per enrolled student.",
  },
  {
    name: "Subscription",
    type: "FIXED",
    monthlyPrice: 10000,
    perStudentRate: null,
    aiTokenAllowance: 100,
    description:
      "Flat subscription fee per billing cycle — monthly, termly, quarterly, half-yearly or annual.",
    tagline: "One flat fee for the whole school, per billing cycle.",
  },
] as const;

async function main() {
  for (const plan of CANONICAL) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        type: plan.type,
        perStudentRate: plan.perStudentRate,
        aiTokenAllowance: plan.aiTokenAllowance,
        description: plan.description,
        tagline: plan.tagline,
        isActive: true,
      },
      create: {
        name: plan.name,
        type: plan.type,
        monthlyPrice: plan.monthlyPrice,
        perStudentRate: plan.perStudentRate,
        aiTokenAllowance: plan.aiTokenAllowance,
        description: plan.description,
        tagline: plan.tagline,
        isActive: true,
      },
    });
    console.log(`✔ ensured canonical plan: ${plan.name} (${plan.type})`);
  }

  // Deactivate anything that is not one of the two canonical plans.
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
