// Per-school API bandwidth accounting.
//
// MongoDB (Prisma) can't aggregate response payloads, so this middleware
// watches every response that passes through the app and increments a daily
// BandwidthStat row for the school the request belongs to. schoolId comes
// from whichever is available: an authenticated school JWT (req.user), the
// X-Tenant-ID header, or (for impersonated platform sessions) the tenant
// context set by tenantMiddleware.
//
// Fire-and-forget upsert: never delays or blocks the response.

import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function bandwidthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.on("finish", () => {
    try {
      const authReq = req as any;
      const schoolId: string | undefined =
        authReq.user?.schoolId ||
        (req.headers["x-tenant-id"] as string | undefined) ||
        undefined;
      if (!schoolId) return; // platform-console & public routes: not school traffic

      const lenHeader = res.getHeader("content-length");
      // Responses streamed without Content-Length (rare here) are skipped
      // rather than estimated — keeps the numbers honest.
      const bytes = typeof lenHeader === "string" ? Number(lenHeader) : 0;
      if (!bytes || bytes <= 0) return;

      const date = utcDay();
      prisma.bandwidthStat
        .upsert({
          where: { schoolId_date: { schoolId, date } },
          create: { schoolId, date, bytes, requests: 1 },
          update: {
            bytes: { increment: bytes },
            requests: { increment: 1 },
          },
        })
        .catch(() => {}); // accounting must never break the API
    } catch {
      /* never break the response over accounting */
    }
  });
  next();
}
