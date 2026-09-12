"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-off debug: dump briefSubjects for recent teachers
const db_1 = __importDefault(require("../config/db"));
async function main() {
    const teachers = await db_1.default.teacher.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            id: true,
            name: true,
            email: true,
            teacherType: true,
            briefSubjects: true,
            registrationStatus: true,
            createdAt: true,
        },
    });
    for (const t of teachers) {
        console.log("=====", t.name, t.email, t.teacherType, t.registrationStatus, t.createdAt);
        console.log(JSON.stringify(t.briefSubjects, null, 2));
    }
    // also count arms/classes/subjects
    const arms = await db_1.default.arm.findMany({ take: 5, include: { class: true } });
    console.log("SAMPLE ARMS:", JSON.stringify(arms.map((a) => ({ id: a.id, letter: a.letter, class: a.class?.name })), null, 2));
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => db_1.default.$disconnect());
