// remove-class-createdAt.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function removeClassCreatedAt() {
  const result = await prisma.$runCommandRaw({
    update: "Class",
    updates: [
      {
        q: { createdAt: { $exists: true } },
        u: { $unset: { createdAt: "" } },
        multi: true
      }
    ]
  });
  console.log('Removed createdAt from Class:', result);
}

removeClassCreatedAt().finally(() => prisma.$disconnect());