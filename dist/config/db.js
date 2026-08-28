"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/config/db.ts
// ⚠️ DEPRECATED import path – kept for backwards compatibility.
// Always re-exports the SINGLE tenant-aware Prisma client defined in
// `config/prisma.ts` (which has the tenant-filtering $use middleware).
// Do NOT create a new PrismaClient here – a second client without the
// middleware bypasses multi-tenant isolation entirely.
const prisma_1 = __importDefault(require("./prisma"));
exports.default = prisma_1.default;
exports.prisma = prisma_1.default;
