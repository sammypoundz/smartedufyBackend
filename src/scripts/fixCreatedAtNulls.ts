// One-off: fix Teacher/User docs whose createdAt is explicitly null
// (P2032 "found incompatible value of null" breaks /teachers, /users, etc.)
import prisma from "../config/db";

async function main() {
  for (const model of ["Teacher", "User"]) {
    const res = await (prisma as any).$runCommandRaw({
      update: model,
      updates: [
        {
          q: {
            $or: [
              { createdAt: { $exists: false } },
              { createdAt: null },
              { createdAt: { $type: "string" } },
            ],
          },
          u: { $currentDate: { createdAt: true } },
          multi: true,
        },
      ],
    });
    const modified =
      (res as any)?.nModified ?? (res as any)?.modifiedCount ?? 0;
    console.log(`Fixed ${modified} ${model} docs with null/missing createdAt`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
