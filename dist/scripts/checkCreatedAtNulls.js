"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-off: inspect Teacher/User createdAt nulls in raw Mongo
const db_1 = __importDefault(require("../config/db"));
async function main() {
    for (const model of ["Teacher", "User"]) {
        const res = await db_1.default.$runCommandRaw({
            aggregate: model,
            pipeline: [
                {
                    $match: {
                        $or: [{ createdAt: null }, { createdAt: { $exists: false } }],
                    },
                },
                { $count: "bad" },
            ],
            cursor: {},
        });
        const batch = res?.cursor?.firstBatch ?? [];
        console.log(model, "bad docs:", batch[0]?.bad ?? 0);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => db_1.default.$disconnect());
