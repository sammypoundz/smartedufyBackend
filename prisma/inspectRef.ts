// One-off: inspect a payment transaction and its verification log.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const ref = process.argv[2] || "SE-PAYSTACK-20261105-18977BFBB0";

async function main() {
  const txn = await prisma.biaPaymentTransaction.findFirst({
    where: { OR: [{ internalReference: ref }, { biaReference: ref }] },
  });
  if (!txn) {
    console.log("NOT FOUND:", ref);
    // show the latest few transactions for context
    const recent = await prisma.biaPaymentTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        internalReference: true,
        biaReference: true,
        status: true,
        fulfilled: true,
        amount: true,
        provider: true,
        createdAt: true,
        verificationLog: true,
      },
    });
    console.log(JSON.stringify(recent, null, 2));
    return;
  }
  console.log(JSON.stringify(txn, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
