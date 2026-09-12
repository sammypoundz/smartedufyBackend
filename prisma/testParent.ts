// One-off script: create a test parent with known credentials + two linked children.
// Run with: npm run test:parent   (from /backend)
import prisma from "../src/config/db";
import bcrypt from "bcryptjs";

const PARENT_EMAIL = "test.parent@smartedufy.com";
const PARENT_PASSWORD = "parent123";

async function main() {
  const school = await prisma.school.findFirst();
  if (!school)
    throw new Error("No school found in the database. Seed a school first.");
  console.log("Using school:", school.name, school.id);

  // Delete leftovers from previous runs so the script is re-runnable
  const oldUser = await prisma.user.findUnique({
    where: { email: PARENT_EMAIL },
  });
  if (oldUser) {
    const oldParent = await prisma.parent.findUnique({
      where: { userId: oldUser.id },
    });
    if (oldParent) {
      await prisma.student.updateMany({
        where: { parentId: oldParent.id },
        data: { parentId: null },
      });
      await prisma.parent.delete({ where: { id: oldParent.id } });
    }
    await prisma.user.delete({ where: { id: oldUser.id } });
  }

  const password = await bcrypt.hash(PARENT_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      name: "Test Parent",
      email: PARENT_EMAIL,
      password,
      role: "PARENT",
      isActive: true,
      schoolId: school.id,
    },
  });

  const parent = await prisma.parent.create({
    data: {
      name: "Test Parent",
      email: PARENT_EMAIL,
      phone: "08000000000",
      userId: user.id,
      schoolId: school.id,
    },
  });

  // Pick an existing class/arm so children show a class name
  const cls = await prisma.class.findFirst({ where: { schoolId: school.id } });
  const arm = await prisma.arm.findFirst({ where: { schoolId: school.id } });
  console.log("Using class:", cls?.name, "| arm:", arm?.letter);

  for (const child of [
    { name: "Chidi Testchild", gender: "male", dob: new Date("2013-04-12") },
    { name: "Ada Testchild", gender: "female", dob: new Date("2015-09-01") },
  ]) {
    // Student requires a linked user account (userId is required)
    const childUser = await prisma.user.findUnique({
      where: {
        email: `${child.name.toLowerCase().replace(/\s/g, ".")}@student.smartedufy.com`,
      },
    });
    const childAccount =
      childUser ??
      (await prisma.user.create({
        data: {
          name: child.name,
          email: `${child.name.toLowerCase().replace(/\s/g, ".")}@student.smartedufy.com`,
          password,
          role: "STUDENT",
          isActive: true,
          schoolId: school.id,
        },
      }));

    await prisma.student.upsert({
      where: { userId: childAccount.id },
      update: { parentId: parent.id },
      create: {
        name: child.name,
        gender: child.gender,
        dateOfBirth: child.dob,
        admissionNumber: `ADM-${Date.now()}-${child.name.slice(0, 1)}`,
        classId: cls?.id,
        armId: arm?.id,
        parentId: parent.id,
        userId: childAccount.id,
        schoolId: school.id,
      },
    });
  }

  console.log("\n✅ Test parent created:");
  console.log("   Email:   ", PARENT_EMAIL);
  console.log("   Password:", PARENT_PASSWORD);
  console.log("   Login at the parent portal with these credentials.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
