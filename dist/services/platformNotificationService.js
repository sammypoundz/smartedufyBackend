"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyPlatform = notifyPlatform;
// Platform notification center (Module 12).
const prisma_1 = require("../config/prisma");
async function notifyPlatform(input) {
    try {
        return await prisma_1.prisma.platformNotification.create({
            data: {
                type: input.type,
                severity: input.severity || "INFO",
                title: input.title,
                message: input.message,
                schoolId: input.schoolId,
                metadata: input.metadata,
            },
        });
    }
    catch (e) {
        console.error("platform notification failed:", e.message);
        return null;
    }
}
