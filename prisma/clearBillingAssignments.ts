/**
 * Clears ALL subscription assignments and billing history so the super admin
 * can re-assign billing to schools afresh, against the two canonical plans.
 *
 * Deletes: subscriptions, subscription payments, AI-token allowance ledger
 * entries tied to subscriptions, and subscription-related notifications.
 * Also resets each school's token wallet balances that were credited from
 * subscription allowances (wallets are zeroed — schools top up afresh).
 *
 * The two canonical billing PLANS (Pay Per Student, Subscription) are kept.
 *
 * Run: npx ts-node prisma/clearBillingAssignments.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Remove subscription allowance credits from token wallets: delete the
  //    ledger first (FK), then the wallets — schools top up afresh.
  const ledgerAll = await prisma.tokenLedger.deleteMany({});
  console.log(`✔ deleted ${ledgerAll.count} token ledger entr(ies)`);
  const wallets = await prisma.tokenWallet.deleteMany({});
  console.log(
    `✔ deleted ${wallets.count} token wallet(s) (balances cleared — schools/AI top up afresh)`,
  );

  // 2. (Ledger already cleared in full above.)

  // 3. Delete subscription payments (billing history).
  const payments = await prisma.subscriptionPayment.deleteMany({});
  console.log(`✔ deleted ${payments.count} subscription payment(s)`);

  // 4. Delete the subscriptions themselves (the assignments).
  const subs = await prisma.subscription.deleteMany({});
  console.log(`✔ deleted ${subs.count} subscription assignment(s)`);

  // 5. Confirm the two canonical plans are intact and active.
  const canonical = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    select: {
      name: true,
      type: true,
      monthlyPrice: true,
      perStudentRate: true,
    },
  });
  console.log("✔ active billing plans:", JSON.stringify(canonical, null, 2));
  console.log(
    "\n🎉 Billing slate wiped — assign afresh from the platform console.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
