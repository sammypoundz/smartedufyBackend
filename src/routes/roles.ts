import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import {
  ALL_PRIVILEGES,
  DEFAULT_ROLES,
  SYSTEM_ROLE_PRIVILEGES,
} from "../utils/privileges";

const router = Router();

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
export async function resolvePrivileges(
  schoolId: string,
  roleNames: string[],
): Promise<string[]> {
  if (!roleNames.length) return [];
  const roles = await prisma.roleDef.findMany({
    where: { schoolId, name: { in: roleNames } },
  });
  const set = new Set<string>();
  for (const r of roles) r.privileges.forEach((p) => set.add(p));
  return [...set];
}

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
    const updated = await prisma.roleDef.update({
      where: { id: role.id },
      data: {
        name: data.name ?? role.name,
        label: data.label ?? role.label,
        description: data.description ?? role.description,
        privileges: data.privileges ?? role.privileges,
      },
    });
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
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
