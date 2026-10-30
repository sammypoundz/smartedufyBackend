"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-time backfill: create missing role-specific profile rows (Teacher,
// Parent) for users that hold those roles in the `roles` array but only have
// a primary `role` of something else (e.g. ACCOUNTANT + TEACHER).
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
async function main() {
    const tenantId = (0, tenantContext_1.getCurrentTenantId)() || process.env.SCHOOL_ID;
    if (!tenantId) {
        console.error("No tenant context. Pass SCHOOL_ID env var.");
        process.exit(1);
    }
    const users = await db_1.default.user.findMany({
        where: { schoolId: tenantId },
        include: { teacher: true, parent: true },
    });
    for (const user of users) {
        const heldRoles = Array.from(new Set([...(user.roles || []), user.role]));
        if (heldRoles.includes("TEACHER") && !user.teacher) {
            await db_1.default.teacher.create({
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
            await db_1.default.parent.create({
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
    (0, tenantContext_1.runWithTenant)(schoolId, main).finally(() => db_1.default.$disconnect());
}
else {
    main().finally(() => db_1.default.$disconnect());
}
