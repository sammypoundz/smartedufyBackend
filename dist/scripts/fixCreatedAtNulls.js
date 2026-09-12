"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-off: fix Teacher/User docs whose createdAt is explicitly null
// (P2032 "found incompatible value of null" breaks /teachers, /users, etc.)
const db_1 = __importDefault(require("../config/db"));
async function main() {
    for (const model of ["Teacher", "User"]) {
        const res = await db_1.default.$runCommandRaw({
            update: model,
            updates: [
                {
                    q: {
                        $or: [
                            { createdAt: { $exists: false } },
                            { createdAt: null },
                            { createdAt: { $type: "string" } },
                        ],
                    },
                    u: { $currentDate: { createdAt: true } },
                    multi: true,
                },
            ],
        });
        const modified = res?.nModified ?? res?.modifiedCount ?? 0;
        console.log(`Fixed ${modified} ${model} docs with null/missing createdAt`);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => db_1.default.$disconnect());
