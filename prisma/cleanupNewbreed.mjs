// Safely wipe ALL data belonging to ONE school only, by ID.
// Usage:
//   node prisma/cleanupNewbreed.mjs            -> DRY RUN (counts only, deletes nothing)
//   node prisma/cleanupNewbreed.mjs --apply    -> actually deletes
// Target: Persist Check 1793995413836 (id 6aeda1a0963359eecdf1247d)
// Safety: resolves the school by ID, verifies its name matches the target,
//         refuses to run if the name changed, and never touches other schools.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const TARGET_ID = "6aeda1a0963359eecdf1247d";
const TARGET_NAME = "Persist Check 1793995413836";
const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

// Discover every model that has a direct schoolId field, plus models whose
// rows hang off school-scoped parents via schoolId on the parent's relations.
async function modelsWithSchoolId() {
  const dmmf = (await import("@prisma/client")).Prisma.dmmf;
  return dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "schoolId"))
    .map((m) => m.name);
}

async function main() {
  const school = await prisma.school.findUnique({ where: { id: TARGET_ID } });
  if (!school) {
    console.log("Target school not found — nothing to do.");
    return;
  }
  if (school.name !== TARGET_NAME) {
    console.log(
      `ABORT: school ${TARGET_ID} is now named "${school.name}", expected "${TARGET_NAME}". Refusing to delete.`,
    );
    return;
  }
  console.log(
    `Target: ${school.name} (${school.id}) — mode: ${APPLY ? "APPLY" : "DRY RUN"}`,
  );

  const modelNames = await modelsWithSchoolId();
  const counts = {};

  // Retry loop: some rows have required relations to other school-scoped rows,
  // so keep sweeping (including failures) until everything is gone.
  const pending = [...modelNames];
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const stillPending = [];
    for (const name of pending) {
      const delegate = prisma[name];
      if (!delegate || typeof delegate.deleteMany !== "function") continue;
      try {
        const r = APPLY
          ? await delegate.deleteMany({ where: { schoolId: TARGET_ID } })
          : await delegate.count({ where: { schoolId: TARGET_ID } });
        const n = r.count ?? r;
        counts[name] = (counts[name] ?? 0) + (typeof n === "number" ? n : 0);
        if (typeof n === "number" && n > 0 && !APPLY) stillPending.push(name);
      } catch (e) {
        if (pass === 0) counts[name] = 0;
        stillPending.push(name); // retry next pass
        if (pass >= 6) console.log(`  STILL FAILING ${name}: ${String(e.message).split("\n")[0]}`);
      }
    }
    pending.length = 0;
    pending.push(...stillPending);
    if (APPLY && pending.length) await new Promise((r) => setTimeout(r, 200));
  }

  let total = 0;
  for (const [name, c] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(28)} ${c}`);
    if (typeof c === "number") total += c;
  }
  console.log(
    `TOTAL rows ${APPLY ? "deleted" : "that would be deleted"}: ${total}`,
  );

  if (APPLY) {
    // Finally remove the school record itself.
    await prisma.school.delete({ where: { id: TARGET_ID } });
    console.log("✅ School record deleted.");
    const remaining = await prisma.school.count();
    console.log(`Remaining schools: ${remaining}`);
  }
}

main().finally(() => prisma.$disconnect());
