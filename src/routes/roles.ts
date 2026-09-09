import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import {
  ALL_PRIVILEGES,
  DEFAULT_ROLES,
  SYSTEM_ROLE_PRIVILEGES,
} from "../utils/privileges";
import { invalidatePrivilegeCache } from "../services/privilegeService";

const router = Router();

/**
 * Union of the current RoleDef privileges for the given role names.
 * `overrides` lets the caller substitute fresh values for roles whose
 * definition was just changed in the same request.
 */
async function combinedRoleDefaults(
  schoolId: string,
  roleNames: string[],
  overrides: Array<[string, string[]]> = [],
): Promise<string[]> {
  const overrideMap = new Map(overrides);
  const roles = await prisma.roleDef.findMany({
    where: { schoolId, name: { in: roleNames } },
  });
  const set = new Set<string>();
  for (const r of roles) {
    const privs = overrideMap.get(r.name) ?? r.privileges;
    privs.forEach((p) => set.add(p));
  }
  return [...set];
}

// Ensure the school has all default system roles (idempotent).
export async function ensureSystemRoles(schoolId: string) {
  const existing = await prisma.roleDef.findMany({ where: { schoolId } });
  const existingNames = new Set(existing.map((r) => r.name));
  for (const def of DEFAULT_ROLES) {
    if (!existingNames.has(def.name)) {
      await prisma.roleDef.create({
        data: {
          schoolId,
          name: def.name,
          label: def.label,
          isSystem: def.isSystem,
          privileges: SYSTEM_ROLE_PRIVILEGES[def.name] || [],
        },
      });
    }
  }
  return prisma.roleDef.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });
}

// Resolve the effective privilege set for a list of role names.
// (Implementation lives in services/privilegeService.ts; re-exported here for
// backward compatibility with existing imports.)
export { resolvePrivileges } from "../services/privilegeService";

router.use(authMiddleware);

// List all roles for the school (auto-creates system roles on first call).
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const schoolId = req.user!.schoolId;
    const roles = await ensureSystemRoles(schoolId);
    res.json(roles);
  } catch (err) {
    next(err);
  }
});

// Privilege catalog (what admins can attach to roles)
router.get("/privileges/catalog", async (_req, res) => {
  res.json(ALL_PRIVILEGES);
});

const roleSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "Use UPPERCASE_WITH_UNDERSCORES"),
  label: z.string().max(80).optional(),
  description: z.string().max(300).optional(),
  privileges: z.array(z.string()).default([]),
});

// Create a custom role
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const schoolId = req.user!.schoolId;
    const data = roleSchema.parse(req.body);
    const exists = await prisma.roleDef.findUnique({
      where: { schoolId_name: { schoolId, name: data.name } },
    });
    if (exists)
      return res
        .status(409)
        .json({ error: "A role with this name already exists" });
    const role = await prisma.roleDef.create({
      data: { ...data, schoolId, isSystem: false },
    });
    invalidatePrivilegeCache();
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
});

// Update a role (privileges, label, description)
router.put("/:id", async (req: AuthRequest, res, next) => {
  try {
    const schoolId = req.user!.schoolId;
    const data = roleSchema.partial().parse(req.body);
    const role = await prisma.roleDef.findFirst({
      where: { id: String(req.params.id), schoolId },
    });
    if (!role) return res.status(404).json({ error: "Role not found" });
    const newPrivileges = data.privileges ?? role.privileges;
    const updated = await prisma.roleDef.update({
      where: { id: role.id },
      data: {
        name: data.name ?? role.name,
        label: data.label ?? role.label,
        description: data.description ?? role.description,
        privileges: newPrivileges,
      },
    });

    // ---- Sync users whose privilege list was DERIVED from role defaults ----
    // The Users page saves a snapshot of a user's role defaults into
    // User.allowedPages (an explicit override list). If we left those
    // snapshots alone, users would keep privileges that were just removed
    // from the role. So: for every user holding this role whose allowedPages
    // matches the OLD combined role defaults (i.e. it was never customized),
    // rewrite the list to the NEW combined defaults. Users with custom,
    // hand-adjusted lists are left untouched.
    if (data.privileges) {
      const affected = await prisma.user.findMany({
        where: { schoolId, roles: { has: role.name } },
        select: { id: true, roles: true, allowedPages: true },
      });
      for (const u of affected) {
        const allRoles = Array.from(new Set([...(u.roles || []), role.name]));
        const oldDefaults = await combinedRoleDefaults(schoolId, allRoles, [
          [role.name, role.privileges],
        ]);
        // Only rewrite if the user's list exactly matches the old defaults
        // (never customized) — or is empty (falls back to defaults anyway).
        const isDerived =
          (u.allowedPages || []).length === 0 ||
          (u.allowedPages || []).length === oldDefaults.length &&
            (u.allowedPages || []).every((p) => oldDefaults.includes(p));
        if (isDerived) {
          const newDefaults = await combinedRoleDefaults(schoolId, allRoles, [
            [role.name, newPrivileges],
          ]);
          await prisma.user.update({
            where: { id: u.id },
            data: { allowedPages: newDefaults },
          });
        }
      }
    }

    // Keep every user holding this role in sync — their effective privileges
    // are re-resolved from the DB on their next request.
    invalidatePrivilegeCache();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a custom role (system roles cannot be deleted)
router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const schoolId = req.user!.schoolId;
    const role = await prisma.roleDef.findFirst({
      where: { id: String(req.params.id), schoolId },
    });
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.isSystem) {
      return res.status(400).json({ error: "System roles cannot be deleted" });
    }
    await prisma.roleDef.delete({ where: { id: role.id } });
    // Remove the deleted role from any users still holding it
    const users = await prisma.user.findMany({
      where: { schoolId, roles: { has: role.name } },
    });
    for (const u of users) {
      await prisma.user.update({
        where: { id: u.id },
        data: { roles: { set: u.roles.filter((r) => r !== role.name) } },
      });
    }
    // Roles changed for these users — drop cached privilege sets
    invalidatePrivilegeCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
