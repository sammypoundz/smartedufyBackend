"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePrivileges = resolvePrivileges;
exports.getUserEffectivePrivileges = getUserEffectivePrivileges;
exports.invalidatePrivilegeCache = invalidatePrivilegeCache;
// src/services/privilegeService.ts
// Central privilege resolution shared by auth routes, the auth middleware and
// the roles routes. Includes a short-lived per-user cache so that requests
// don't hit the DB every time, with an invalidation hook that fires whenever
// a role definition changes — keeping every user's privileges in sync with
// their roles without requiring a re-login.
const prisma_1 = require("../config/prisma");
const CACHE_TTL_MS = 30000; // 30s safety net; invalidated explicitly on change
const cache = new Map();
/** Resolve the effective privilege set for a list of role names. */
async function resolvePrivileges(schoolId, roleNames) {
    if (!roleNames.length)
        return [];
    const roles = await prisma_1.prisma.roleDef.findMany({
        where: { schoolId, name: { in: roleNames } },
    });
    const set = new Set();
    for (const r of roles)
        r.privileges.forEach((p) => set.add(p));
    return [...set];
}
/**
 * Get a user's effective privileges, freshly derived from their roles
 * (or their explicit allowedPages override), backed by a short cache.
 */
async function getUserEffectivePrivileges(userId) {
    const hit = cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) {
        return { roles: hit.roles, privileges: hit.privileges };
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            schoolId: true,
            role: true,
            roles: true,
            allowedPages: true,
        },
    });
    if (!user)
        return null;
    // Normalize roles: always include the legacy primary role
    const roles = Array.from(new Set([...(user.roles || []), user.role]));
    // Explicit allowedPages list saved by an admin overrides role defaults.
    const privileges = (user.allowedPages || []).length > 0
        ? Array.from(new Set(user.allowedPages))
        : await resolvePrivileges(user.schoolId, roles);
    cache.set(userId, {
        roles,
        privileges,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return { roles, privileges };
}
/**
 * Called whenever a role definition is created/updated/deleted (or a user's
 * role assignment changes) so every request immediately sees the new
 * privileges instead of the cached ones.
 */
function invalidatePrivilegeCache() {
    cache.clear();
}
