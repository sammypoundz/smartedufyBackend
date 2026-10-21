const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const u = await p.user.findFirst({
    where: { email: "alicia@gmail.com" },
    include: { teacher: true },
  });
  if (!u) {
    console.log("user not found");
    return;
  }
  console.log(
    JSON.stringify(
      {
        role: u.role,
        roles: u.roles,
        teacherId: u.teacher && u.teacher.id,
        teacherName: u.teacher && u.teacher.name,
      },
      null,
      1,
    ),
  );
  const teachers = await p.teacher.findMany({
    where: { schoolId: u.schoolId },
    select: { email: true },
  });
  console.log(
    "Teachers in school:",
    teachers.map((t) => t.email),
  );
  await p.$disconnect();
})();
