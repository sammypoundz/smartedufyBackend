"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// One-time migration: remove the 'reports' privilege from the ACCOUNTANT role
// everywhere it exists — RoleDef.privileges and any User.allowedPages snapshot
// that was derived from it. Users with hand-customized lists keep other pages;
// only 'reports' is stripped from accountant users.
// Run: npx ts-node --transpile-only src/scripts/removeReportsFromAccountants.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // 1. Update every ACCOUNTANT RoleDef
    const roleDefs = await prisma.roleDef.findMany({
        where: { name: "ACCOUNTANT", privileges: { has: "reports" } },
    });
    for (const r of roleDefs) {
        await prisma.roleDef.update({
            where: { id: r.id },
            data: { privileges: r.privileges.filter((p) => p !== "reports") },
        });
    }
    console.log(`Updated ${roleDefs.length} ACCOUNTANT roleDef(s).`);
    // 2. Strip 'reports' from allowedPages of users holding the ACCOUNTANT role
    //    (their snapshot may still carry it from the old role defaults).
    const users = await prisma.user.findMany({
        where: {
            OR: [{ role: "ACCOUNTANT" }, { roles: { has: "ACCOUNTANT" } }],
            allowedPages: { has: "reports" },
        },
        select: {
            id: true,
            email: true,
            role: true,
            roles: true,
            allowedPages: true,
        },
    });
    for (const u of users) {
        const roles = Array.from(new Set([...(u.roles || []), u.role]));
        // Only strip for users whose reports access comes solely from ACCOUNTANT —
        // if they also hold a role that still grants reports (e.g. TEACHER),
        // leave the snapshot alone.
        const otherRoles = roles.filter((r) => r !== "ACCOUNTANT");
        const defs = otherRoles.length
            ? await prisma.roleDef.findMany({
                where: { name: { in: otherRoles }, privileges: { has: "reports" } },
            })
            : [];
        if (defs.length > 0)
            continue;
        await prisma.user.update({
            where: { id: u.id },
            data: {
                allowedPages: (u.allowedPages || []).filter((p) => p !== "reports"),
            },
        });
        console.log(`Stripped 'reports' from allowedPages of ${u.email}`);
    }
    console.log(`Checked ${users.length} accountant user(s) with 'reports' grants.`);
}
main().finally(() => prisma.$disconnect());
