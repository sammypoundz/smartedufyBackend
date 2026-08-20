// fix-all-dates.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixAllDates() {
  try {
    // 1. Fix Student.createdAt (string -> Date)
    console.log('Fixing Student.createdAt...');
    await prisma.$runCommandRaw({
      update: "Student",
      updates: [
        {
          q: { createdAt: { $type: "string" } },
          u: [{ $set: { createdAt: { $toDate: "$createdAt" } } }],
          multi: true
        }
      ]
    });

    // 2. Fix Student.updatedAt (null -> current date)
    console.log('Fixing Student.updatedAt...');
    await prisma.$runCommandRaw({
      update: "Student",
      updates: [
        {
          q: { updatedAt: null },
          u: [{ $set: { updatedAt: new Date() } }],
          multi: true
        }
      ]
    });

    // 3. If Class still has createdAt (remove it completely)
    console.log('Removing Class.createdAt if exists...');
    await prisma.$runCommandRaw({
      update: "Class",
      updates: [
        {
          q: { createdAt: { $exists: true } },
          u: { $unset: { createdAt: "" } },
          multi: true
        }
      ]
    });

    // 4. Fix Class.updatedAt (null -> current date)
    console.log('Fixing Class.updatedAt...');
    await prisma.$runCommandRaw({
      update: "Class",
      updates: [
        {
          q: { updatedAt: null },
          u: [{ $set: { updatedAt: new Date() } }],
          multi: true
        }
      ]
    });

    // 5. Also fix other models that have updatedAt (User, Parent, Teacher, etc.)
    const models = ['User', 'Parent', 'Teacher', 'Arm', 'Subject', 'GradingScale', 'Topic'];
    for (const model of models) {
      console.log(`Fixing ${model}.updatedAt...`);
      await prisma.$runCommandRaw({
        update: model,
        updates: [
          {
            q: { updatedAt: null },
            u: [{ $set: { updatedAt: new Date() } }],
            multi: true
          }
        ]
      });
    }

    console.log('All fixes completed successfully!');
  } catch (error) {
    console.error('Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllDates();