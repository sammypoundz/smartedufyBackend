// src/config/db.ts
// ⚠️ DEPRECATED import path – kept for backwards compatibility.
// Always re-exports the SINGLE tenant-aware Prisma client defined in
// `config/prisma.ts` (which has the tenant-filtering $use middleware).
// Do NOT create a new PrismaClient here – a second client without the
// middleware bypasses multi-tenant isolation entirely.
import prismaClient from './prisma';

export default prismaClient;
export const prisma = prismaClient;