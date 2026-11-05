import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const ws = await p.tokenWallet.findMany();
  console.log(
    "WALLETS:",
    JSON.stringify(
      ws.map((w) => ({
        school: w.schoolId,
        balance: w.balance,
        lifetimePurchased: w.lifetimePurchased,
      })),
    ),
  );
  const l = await p.tokenLedger.findMany();
  console.log(
    "LEDGER:",
    JSON.stringify(l.map((e) => ({ ref: e.reference, amount: e.amount }))),
  );
  console.log("BIA TXNS:", await p.biaPaymentTransaction.count());
  console.log("PKG PURCHASES:", await p.packagePurchase.count());
  await p.$disconnect();
})();
