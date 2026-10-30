"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Diagnostic: inspect an accountant user's effective privileges vs what the
// finance guards expect. Usage: npx ts-node src/scripts/diagnoseAccountant.ts <email>
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { role: { in: ["ACCOUNTANT", "BURSAR"] } },
                { roles: { hasSome: ["ACCOUNTANT", "BURSAR"] } },
            ],
        },
        select: {
            id: true,
            email: true,
            role: true,
            roles: true,
            allowedPages: true,
            schoolId: true,
        },
        take: 20,
    });
    console.log(`Found ${users.length} accountant/bursar users\n`);
    for (const u of users) {
        console.log(JSON.stringify(u, null, 2));
        const roleDefs = await prisma.roleDef.findMany({
            where: {
                schoolId: u.schoolId,
                name: { in: Array.from(new Set([...(u.roles || []), u.role])) },
            },
            select: { name: true, privileges: true },
        });
        for (const r of roleDefs)
            console.log(`  roleDef ${r.name}: [${r.privileges.join(", ")}]`);
        console.log("---");
    }
}
main().finally(() => prisma.$disconnect());
