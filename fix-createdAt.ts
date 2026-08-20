// fix-createdAt.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixCreatedAt() {
  try {
    // Convert string createdAt to Date for all Student documents
    const result = await prisma.$runCommandRaw({
      update: "Student",
      updates: [
        {
          q: { createdAt: { $type: "string" } }, // find documents where createdAt is a string
          u: [
            {
              $set: {
                createdAt: { $toDate: "$createdAt" } // convert to Date
              }
            }
          ],
          multi: true
        }
      ]
    });
    console.log('Student createdAt conversion result:', result);

    // If you also need to convert for Class (if you kept createdAt), uncomment:
    // const classResult = await prisma.$runCommandRaw({
    //   update: "Class",
    //   updates: [
    //     {
    //       q: { createdAt: { $type: "string" } },
    //       u: [{ $set: { createdAt: { $toDate: "$createdAt" } } }],
    //       multi: true
    //     }
    //   ]
    // });
    // console.log('Class createdAt conversion result:', classResult);

  } catch (error) {
    console.error('Conversion failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCreatedAt();