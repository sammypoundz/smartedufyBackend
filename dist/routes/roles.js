"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePrivileges = void 0;
exports.ensureSystemRoles = ensureSystemRoles;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const privileges_1 = require("../utils/privileges");
const privilegeService_1 = require("../services/privilegeService");
const router = (0, express_1.Router)();
/**
 * Union of the current RoleDef privileges for the given role names.
 * `overrides` lets the caller substitute fresh values for roles whose
 * definition was just changed in the same request.
 */
async function combinedRoleDefaults(schoolId, roleNames, overrides = []) {
    const overrideMap = new Map(overrides);
    const roles = await prisma_1.prisma.roleDef.findMany({
        where: { schoolId, name: { in: roleNames } },
    });
    const set = new Set();
    for (const r of roles) {
        const privs = overrideMap.get(r.name) ?? r.privileges;
        privs.forEach((p) => set.add(p));
    }
    return [...set];
}
// Ensure the school has all default system roles (idempotent).
async function ensureSystemRoles(schoolId) {
    const existing = await prisma_1.prisma.roleDef.findMany({ where: { schoolId } });
    const existingNames = new Set(existing.map((r) => r.name));
    for (const def of privileges_1.DEFAULT_ROLES) {
        if (!existingNames.has(def.name)) {
            await prisma_1.prisma.roleDef.create({
                data: {
                    schoolId,
                    name: def.name,
                    label: def.label,
                    isSystem: def.isSystem,
                    privileges: privileges_1.SYSTEM_ROLE_PRIVILEGES[def.name] || [],
                },
            });
        }
    }
    return prisma_1.prisma.roleDef.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
    });
}
// Resolve the effective privilege set for a list of role names.
// (Implementation lives in services/privilegeService.ts; re-exported here for
// backward compatibility with existing imports.)
var privilegeService_2 = require("../services/privilegeService");
Object.defineProperty(exports, "resolvePrivileges", { enumerable: true, get: function () { return privilegeService_2.resolvePrivileges; } });
router.use(auth_1.authMiddleware);
// List all roles for the school (auto-creates system roles on first call).
router.get("/", async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId;
        const roles = await ensureSystemRoles(schoolId);
        res.json(roles);
    }
    catch (err) {
        next(err);
    }
});
// Privilege catalog (what admins can attach to roles)
router.get("/privileges/catalog", async (_req, res) => {
    res.json(privileges_1.ALL_PRIVILEGES);
});
const roleSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1)
        .max(60)
        .regex(/^[A-Z0-9_]+$/, "Use UPPERCASE_WITH_UNDERSCORES"),
    label: zod_1.z.string().max(80).optional(),
    description: zod_1.z.string().max(300).optional(),
    privileges: zod_1.z.array(zod_1.z.string()).default([]),
});
// Create a custom role
router.post("/", async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId;
        const data = roleSchema.parse(req.body);
        const exists = await prisma_1.prisma.roleDef.findUnique({
            where: { schoolId_name: { schoolId, name: data.name } },
        });
        if (exists)
            return res
                .status(409)
                .json({ error: "A role with this name already exists" });
        const role = await prisma_1.prisma.roleDef.create({
            data: { ...data, schoolId, isSystem: false },
        });
        (0, privilegeService_1.invalidatePrivilegeCache)();
        res.status(201).json(role);
    }
    catch (err) {
        next(err);
    }
});
// Update a role (privileges, label, description)
router.put("/:id", async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId;
        const data = roleSchema.partial().parse(req.body);
        const role = await prisma_1.prisma.roleDef.findFirst({
            where: { id: String(req.params.id), schoolId },
        });
        if (!role)
            return res.status(404).json({ error: "Role not found" });
        const newPrivileges = data.privileges ?? role.privileges;
        const updated = await prisma_1.prisma.roleDef.update({
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
            const affected = await prisma_1.prisma.user.findMany({
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
                const isDerived = (u.allowedPages || []).length === 0 ||
                    (u.allowedPages || []).length === oldDefaults.length &&
                        (u.allowedPages || []).every((p) => oldDefaults.includes(p));
                if (isDerived) {
                    const newDefaults = await combinedRoleDefaults(schoolId, allRoles, [
                        [role.name, newPrivileges],
                    ]);
                    await prisma_1.prisma.user.update({
                        where: { id: u.id },
                        data: { allowedPages: newDefaults },
                    });
                }
            }
        }
        // Keep every user holding this role in sync — their effective privileges
        // are re-resolved from the DB on their next request.
        (0, privilegeService_1.invalidatePrivilegeCache)();
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// Delete a custom role (system roles cannot be deleted)
router.delete("/:id", async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId;
        const role = await prisma_1.prisma.roleDef.findFirst({
            where: { id: String(req.params.id), schoolId },
        });
        if (!role)
            return res.status(404).json({ error: "Role not found" });
        if (role.isSystem) {
            return res.status(400).json({ error: "System roles cannot be deleted" });
        }
        await prisma_1.prisma.roleDef.delete({ where: { id: role.id } });
        // Remove the deleted role from any users still holding it
        const users = await prisma_1.prisma.user.findMany({
            where: { schoolId, roles: { has: role.name } },
        });
        for (const u of users) {
            await prisma_1.prisma.user.update({
                where: { id: u.id },
                data: { roles: { set: u.roles.filter((r) => r !== role.name) } },
            });
        }
        // Roles changed for these users — drop cached privilege sets
        (0, privilegeService_1.invalidatePrivilegeCache)();
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
