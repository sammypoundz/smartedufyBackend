import { prisma } from "../config/prisma";
import { getCurrentTenantId } from "../utils/tenantContext";

// ===================== AUTO ID GENERATOR =====================
// Roles supported out of the box. The UI offers these plus any custom roles.
export const ID_ROLES = [
  "STUDENT",
  "TEACHER",
  "PARENT",
  "ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "ACCOUNTANT",
  "LIBRARIAN",
] as const;

export type IdRole = (typeof ID_ROLES)[number] | string;

export const DEFAULT_ID_FORMATS: Record<string, string> = {
  STUDENT: "STU-{YEAR}-{####}",
  TEACHER: "TCH-{###}",
  PARENT: "PAR-{###}",
  ADMIN: "ADM-{###}",
  PRINCIPAL: "PRN-{###}",
  BURSAR: "BUR-{###}",
  ACCOUNTANT: "ACC-{###}",
  LIBRARIAN: "LIB-{###}",
};

/**
 * Render an ID from a format string.
 * Tokens: {####} → counter zero-padded to 4 digits (any run of #'s sets
 * padding width), {YEAR} → 4-digit year, {ROLE} → role name.
 * A format without #'s still works (e.g. "{ROLE}-{YEAR}-0001" is fixed text).
 */
export function renderId(
  format: string,
  counter: number,
  role: string,
  year = new Date().getFullYear(),
): string {
  return format
    .replace(/\{(#+)\}/g, (_m, hashes: string) =>
      String(counter).padStart(hashes.length, "0"),
    )
    .replace(/\{YEAR\}/g, String(year))
    .replace(/\{ROLE\}/g, role);
}

/** True when the format contains at least one counter token. */
export function formatHasCounter(format: string): boolean {
  return /\{#+\}/.test(format);
}

/**
 * Extract the numeric counter from a manually entered ID, given the role's
 * format. Matches the numeric part that corresponds to the {###...} token so
 * "STU-2025-0123" with format "STU-{YEAR}-{####}" yields 123. Falls back to
 * the last number group in the string when the exact shape doesn't match.
 */
export function extractCounter(
  manualId: string,
  format: string,
): number | null {
  // Build a regex from the format: escape literals, {###+} → (\d+), {YEAR} → \d{4}
  const pattern = format
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex chars (also escapes {})
    .replace(
      /\\\{(#+)\\\}/g,
      (_m, hashes: string) => `(\\d{${hashes.length},})`,
    )
    .replace(/\\\{YEAR\\\}/g, "\\d{4}")
    .replace(/\\\{ROLE\\\}/g, ".+");
  try {
    const re = new RegExp(`^${pattern}$`);
    const m = manualId.trim().match(re);
    if (m && m[1]) return parseInt(m[1], 10);
  } catch {
    /* invalid pattern — fall through */
  }
  // Fallback: last number group in the string
  const nums = manualId.trim().match(/\d+/g);
  return nums && nums.length ? parseInt(nums[nums.length - 1], 10) : null;
}

export const idGeneratorService = {
  /** All configs for the current school, keyed by role. */
  getAllConfigs: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const configs = await prisma.idGeneratorConfig.findMany({
      where: { schoolId: tenantId },
      orderBy: { role: "asc" },
    });
    return configs;
  },

  /** Save (upsert) a role's format. Counter is only set explicitly by admin. */
  saveConfig: async (data: {
    role: string;
    format: string;
    counter?: number;
    resetCounter?: boolean;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const format = data.format.trim();
    if (!format) throw new Error("Format is required");
    if (!/\{#+\}|\d/.test(format)) {
      throw new Error("Format must include a counter token ({###}) or digits");
    }

    const existing = await prisma.idGeneratorConfig.findUnique({
      where: { schoolId_role: { schoolId: tenantId, role: data.role } },
    });

    return prisma.idGeneratorConfig.upsert({
      where: { schoolId_role: { schoolId: tenantId, role: data.role } },
      update: {
        format,
        ...(data.resetCounter ? { counter: 0, lastResetYear: null } : {}),
        ...(data.counter !== undefined && !data.resetCounter
          ? // Never allow the admin to LOWER the counter below what's used.
            { counter: Math.max(data.counter, existing?.counter ?? 0) }
          : {}),
      },
      create: {
        schoolId: tenantId,
        role: data.role,
        format,
        counter: data.counter ?? 0,
      },
    });
  },

  /** Preview the next ID for a role WITHOUT consuming it. */
  previewNextId: async (
    role: string,
  ): Promise<{ format: string; nextId: string; counter: number }> => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const config = await prisma.idGeneratorConfig.findUnique({
      where: { schoolId_role: { schoolId: tenantId, role } },
    });
    const format =
      config?.format ?? DEFAULT_ID_FORMATS[role] ?? "{ROLE}-{####}";
    const year = new Date().getFullYear();
    // Yearly reset: when the format uses {YEAR} and the counter was last
    // reset in a previous year, the preview starts from 1 again.
    let counter = config?.counter ?? 0;
    const usesYear = /\{YEAR\}/.test(format);
    if (usesYear && config?.lastResetYear !== year) {
      // Only show a reset preview if yearly reset is meaningful (never used
      // yet, or reset happened in a previous year).
      if (
        config?.lastResetYear !== undefined &&
        config.lastResetYear !== null &&
        config.lastResetYear !== year
      ) {
        counter = 0;
      } else if (
        config?.lastResetYear === null ||
        config?.lastResetYear === undefined
      ) {
        // First use — leave counter as-is (admin may have seeded it).
      }
    }
    return {
      format,
      nextId: renderId(format, counter + 1, role, year),
      counter,
    };
  },

  /**
   * Atomically claim the next ID for a role. Runs inside a transaction and
   * upserts the config, incrementing the counter — safe under concurrency
   * because the increment is computed from the row read inside the same
   * transaction and MongoDB applies the transaction's write atomically.
   * Handles optional yearly reset when the format contains {YEAR}.
   */
  claimNextId: async (role: string): Promise<string> => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const year = new Date().getFullYear();

    return prisma.$transaction(async (tx) => {
      let config = await tx.idGeneratorConfig.findUnique({
        where: { schoolId_role: { schoolId: tenantId, role } },
      });
      const format =
        config?.format ?? DEFAULT_ID_FORMATS[role] ?? "{ROLE}-{####}";
      let counter = config?.counter ?? 0;
      // Yearly reset support: if the format uses {YEAR} and we haven't
      // reset in the current year, start from 0 again.
      if (/\{YEAR\}/.test(format) && config && config.lastResetYear !== year) {
        counter = 0;
        config = { ...config, lastResetYear: year };
      }
      const next = counter + 1;
      const id = renderId(format, next, role, year);

      await tx.idGeneratorConfig.upsert({
        where: { schoolId_role: { schoolId: tenantId, role } },
        update: {
          counter: next,
          ...(config?.lastResetYear
            ? { lastResetYear: config.lastResetYear }
            : {}),
        },
        create: {
          schoolId: tenantId,
          role,
          format,
          counter: next,
          lastResetYear: year,
        },
      });
      return id;
    });
  },

  /**
   * Manual-ID path: check uniqueness across User (email-independent) custom
   * IDs AND student admission numbers; bump the role counter if the entered
   * number is higher than the stored counter (never lower it).
   * Throws on duplicates.
   */
  registerManualId: async (role: string, manualId: string): Promise<string> => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");
    const id = manualId.trim();
    if (!id) throw new Error("ID is required");

    // Duplicate check against existing custom IDs and admission numbers.
    const dupUser = await prisma.user.findFirst({
      where: { schoolId: tenantId, userIdCode: id },
      select: { id: true },
    });
    if (dupUser) throw new Error(`ID "${id}" is already in use`);
    if (role === "STUDENT") {
      const dupStudent = await prisma.student.findFirst({
        where: { schoolId: tenantId, admissionNumber: id },
        select: { id: true },
      });
      if (dupStudent) throw new Error(`ID "${id}" is already in use`);
    }

    const format =
      (
        await prisma.idGeneratorConfig.findUnique({
          where: { schoolId_role: { schoolId: tenantId, role } },
        })
      )?.format ??
      DEFAULT_ID_FORMATS[role] ??
      "{ROLE}-{####}";

    if (formatHasCounter(format)) {
      // Advance the role counter when the manual number is higher than the
      // stored counter — never decrease it. The whole check-and-set runs in
      // one transaction so concurrent registrations can't race it backwards.
      const parsed = extractCounter(id, format);
      if (parsed !== null) {
        await prisma.$transaction(async (tx) => {
          const config = await tx.idGeneratorConfig.findUnique({
            where: { schoolId_role: { schoolId: tenantId, role } },
          });
          const current = config?.counter ?? 0;
          await tx.idGeneratorConfig.upsert({
            where: { schoolId_role: { schoolId: tenantId, role } },
            update: { counter: Math.max(parsed, current) },
            create: { schoolId: tenantId, role, format, counter: parsed },
          });
        });
      }
    }
    return id;
  },
};
