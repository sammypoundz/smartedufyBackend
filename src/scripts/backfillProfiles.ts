// One-time backfill: create missing role-specific profile rows (Teacher,
// Parent) for users that hold those roles in the `roles` array but only have
// a primary `role` of something else (e.g. ACCOUNTANT + TEACHER).
import prisma from "../config/db";
import { getCurrentTenantId, runWithTenant } from "../utils/tenantContext";

async function main() {
  const tenantId = getCurrentTenantId() || process.env.SCHOOL_ID;
  if (!tenantId) {
    console.error("No tenant context. Pass SCHOOL_ID env var.");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { schoolId: tenantId },
    include: { teacher: true, parent: true },
  });

  for (const user of users) {
    const heldRoles = Array.from(new Set([...(user.roles || []), user.role]));

    if (heldRoles.includes("TEACHER") && !user.teacher) {
      await prisma.teacher.create({
        data: {
          name: user.name || user.email,
          email: user.email,
          phone: "",
          userId: user.id,
          schoolId: tenantId,
        },
      });
      console.log(`✅ Created Teacher profile for ${user.email}`);
    }

    if (heldRoles.includes("PARENT") && !user.parent) {
      await prisma.parent.create({
        data: {
          name: user.name || user.email,
          email: user.email,
          phone: "",
          userId: user.id,
          schoolId: tenantId,
        },
      });
      console.log(`✅ Created Parent profile for ${user.email}`);
    }
  }

  console.log("Backfill complete.");
}

const schoolId = process.argv[2];
if (schoolId) {
  runWithTenant(schoolId, main).finally(() => prisma.$disconnect());
} else {
  main().finally(() => prisma.$disconnect());
}
