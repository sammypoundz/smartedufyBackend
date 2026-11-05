/**
 * One-off maintenance script:
 *  1. Wipes ALL token wallets, token ledger entries, token-package purchases
 *     and BIA payment transactions across every school.
 *  2. Credits ONLY the demo test school with 10 fresh tokens.
 *
 * Run: npx tsx prisma/resetTokensDemoSchool.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_SCHOOL = "demo test"; // matched case-insensitively

async function main() {
  // 1. Wipe all token data — ledger first (FK), then wallets, purchases, txns.
  const ledger = await prisma.tokenLedger.deleteMany({});
  console.log(`✔ deleted ${ledger.count} token ledger entr(ies)`);

  const wallets = await prisma.tokenWallet.deleteMany({});
  console.log(`✔ deleted ${wallets.count} token wallet(s)`);

  const purchases = await prisma.packagePurchase.deleteMany({});
  console.log(`✔ deleted ${purchases.count} package purchase(s)`);

  const biaTxns = await prisma.biaPaymentTransaction.deleteMany({});
  console.log(`✔ deleted ${biaTxns.count} BIA payment transaction(s)`);

  // 2. Find the demo test school.
  const school = await prisma.school.findFirst({
    where: { name: { contains: DEMO_SCHOOL, mode: "insensitive" } },
    select: { id: true, name: true, subdomain: true },
  });
  if (!school) {
    throw new Error(
      `No school matching "${DEMO_SCHOOL}" found — nothing credited.`,
    );
  }
  console.log(`✔ target school: ${school.name} (${school.subdomain})`);

  // 3. Credit exactly 10 tokens to that school (purchase() is idempotent on
  //    (schoolId, reference) and creates the wallet if missing).
  const ref = "RESET-DEMO-10";
  const already = await prisma.tokenLedger.findUnique({
    where: { schoolId_reference: { schoolId: school.id, reference: ref } },
  });
  if (already) {
    console.log(
      "ℹ demo school already credited with this reset reference — skipping",
    );
  } else {
    // Direct writes (mirrors tokenWalletService.purchase semantics).
    const wallet = await prisma.tokenWallet.upsert({
      where: { schoolId: school.id },
      update: {
        balance: { increment: 10 },
        lifetimePurchased: { increment: 10 },
      },
      create: { schoolId: school.id, balance: 10, lifetimePurchased: 10 },
    });
    await prisma.tokenLedger.create({
      data: {
        schoolId: school.id,
        reference: ref,
        type: "PURCHASE",
        amount: 10,
        balanceAfter: wallet.balance,
        description: "System reset — demo school credited with 10 tokens",
        wallet: { connect: { schoolId: school.id } },
      },
    });
    console.log(
      `🎉 ${school.name} credited with 10 tokens (balance: ${wallet.balance})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
