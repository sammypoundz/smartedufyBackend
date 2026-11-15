import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();
const prisma = new PrismaClient();

async function main() {
  // Raw collection scan — bypasses the Prisma client typing/cache entirely.
  const db = (prisma as any).__internalEngine?.client ?? null;
  void db;
  // Use $runCommandRaw against the student collection stats via $rawQuery-style approach:
  const colls: any = await (prisma as any)
    .$runCommandRaw({ collstats: "students" })
    .catch((e: any) => e.message);
  console.log("collstats students:", JSON.stringify(colls)?.slice(0, 300));
  const sample: any = await (prisma as any)
    .$runCommandRaw({
      aggregate: "students",
      pipeline: [
        { $sample: { size: 2 } },
        { $project: { name: 1, studentCode: 1, admissionNumber: 1 } },
      ],
      cursor: {},
    })
    .catch((e: any) => ({ err: e.message }));
  const batch = sample?.cursor?.firstBatch ?? sample;
  console.log("raw sample:", JSON.stringify(batch));
}

main().finally(() => prisma.$disconnect());
