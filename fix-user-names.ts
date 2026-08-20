import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixUserNames() {
  const users = await prisma.user.findMany({
    include: { student: true, teacher: true, parent: true },
  });
  for (const user of users) {
    if (!user.name) {
      let name = '';
      if (user.student) name = user.student.name;
      else if (user.teacher) name = user.teacher.name;
      else if (user.parent) name = user.parent.name;
      else name = user.email.split('@')[0];
      await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
      console.log(`Updated ${user.email} → ${name}`);
    }
  }
  console.log('All users now have a name.');
}
fixUserNames();