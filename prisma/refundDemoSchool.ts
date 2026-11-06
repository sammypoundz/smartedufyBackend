// One-off: refund (reverse) the 10-token demo grant on the demo test school.
import { tokenWalletService } from "../src/services/tokenWalletService";
import { prisma } from "../src/config/prisma";

async function main() {
  const school = await prisma.school.findFirst({
    where: { name: { contains: "demo", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!school) throw new Error("No school with 'demo' in its name was found");
  console.log(`School: ${school.name} (${school.id})`);

  const before = await tokenWalletService.getWallet(school.id);
  console.log("Balance before:", before.balance);

  const ref = `DEMO-REFUND-${Date.now()}`;
  const result = await tokenWalletService.adjust(
    school.id,
    -10,
    "Reversal of demo funding grant — 10 Edufy AI tokens deducted (manual adjustment)",
    ref,
  );
  console.log(`Deducted 10 tokens · ref ${ref}`);
  console.log("New balance:", result.wallet.balance);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
