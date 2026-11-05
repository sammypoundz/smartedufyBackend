// One-off: fund the demo test school with 10 tokens (ADJUSTMENT ledger entry).
import { tokenWalletService } from "../src/services/tokenWalletService";
import { prisma } from "../src/config/prisma";

async function main() {
  const school = await prisma.school.findFirst({
    where: { name: { contains: "demo", mode: "insensitive" } },
    select: { id: true, name: true, isActive: true },
  });
  if (!school) throw new Error("No school with 'demo' in its name was found");
  console.log(
    `School: ${school.name} (${school.id}) active=${school.isActive}`,
  );

  const ref = `DEMO-FUND-${Date.now()}`;
  const result = await tokenWalletService.adjust(
    school.id,
    10,
    "Demo funding — 10 complimentary Edufy AI tokens (manual grant)",
    ref,
  );
  console.log(`Credited 10 tokens · ref ${ref}`);
  console.log("New balance:", result.wallet.balance);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
