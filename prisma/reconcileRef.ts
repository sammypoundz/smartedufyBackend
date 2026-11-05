// One-off: re-run reconcile for a stuck REVERSED transaction (MANUAL trigger).
import { reconcileTransaction } from "../src/services/biaPaymentService";
import { prisma } from "../src/config/prisma";

const ref = process.argv[2] || "SE-PAYSTACK-20261105-18977BFBB0";

async function main() {
  const txn = await prisma.biaPaymentTransaction.findFirst({
    where: { OR: [{ internalReference: ref }, { biaReference: ref }] },
  });
  if (!txn) throw new Error("Not found: " + ref);
  const result = await reconcileTransaction(txn.id, "MANUAL");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
