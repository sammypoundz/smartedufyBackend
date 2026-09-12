"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-off: remove teacher test accounts created during flow debugging
const db_1 = __importDefault(require("../config/db"));
const TEST_EMAILS = [
    "flowtest1@school.com",
    "flowtest2@school.com",
    "flowtest3@school.com",
];
async function main() {
    for (const email of TEST_EMAILS) {
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (!user)
            continue;
        await db_1.default.teacher.deleteMany({ where: { userId: user.id } });
        await db_1.default.user.delete({ where: { id: user.id } });
        console.log("deleted", email);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => db_1.default.$disconnect());
