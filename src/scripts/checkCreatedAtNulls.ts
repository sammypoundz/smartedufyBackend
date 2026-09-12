// One-off: inspect Teacher/User createdAt nulls in raw Mongo
import prisma from "../config/db";

async function main() {
  for (const model of ["Teacher", "User"]) {
    const res = await (prisma as any).$runCommandRaw({
      aggregate: model,
      pipeline: [
        {
          $match: {
            $or: [{ createdAt: null }, { createdAt: { $exists: false } }],
          },
        },
        { $count: "bad" },
      ],
      cursor: {},
    });
    const batch = (res as any)?.cursor?.firstBatch ?? [];
    console.log(model, "bad docs:", batch[0]?.bad ?? 0);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
