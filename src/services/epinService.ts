// Result Checker e-Pin service
// Every term, schools generate new unique e-Pins (serial + PIN) for their
// students. Students/parents redeem a serial + PIN on the public check
// endpoint to view the student's results for that term.
import { randomInt, randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import { getCurrentTenantId } from "../utils/tenantContext";

// PIN alphabet without ambiguous characters (0/O, 1/I) so printed pins are easy
// to read off a scratch card.
const PIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePin(length = 8): string {
  let pin = "";
  for (let i = 0; i < length; i++)
    pin += PIN_ALPHABET[randomInt(PIN_ALPHABET.length)];
  return pin;
}

function generateSerial(): string {
  // UUID hex trimmed + formatted: EP-XXXX-XXXX-XXXX
  const hex = randomUUID().replace(/-/g, "").toUpperCase();
  return `EP-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export interface EpinRow {
  id: string;
  serial: string;
  pin: string;
  studentId: string;
  studentName: string;
  admissionNumber?: string | null;
  className?: string | null;
  armLetter?: string | null;
  term: string;
  academicYearId: string;
  uses: number;
  maxUses: number;
  usedAt: string | null;
  expiresAt: string | null;
}

export const epinService = {
  /**
   * Generate e-Pins for all active students of an arm for a term.
   * Idempotent: students that already have a pin for the term keep theirs;
   * only missing pins are created (so regenerating mid-term never breaks
   * pins already distributed). Serials & PINs are unique per school — the
   * DB unique indexes are the final guarantee; we retry on collision.
   */
  generateForArm: async (opts: {
    armId: string;
    academicYearId: string;
    term: string;
    maxUses?: number;
    expiresInDays?: number;
  }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    const students = await prisma.student.findMany({
      where: { armId: opts.armId, schoolId: tenantId, isActive: true },
      select: { id: true, name: true, admissionNumber: true },
    });
    if (students.length === 0) {
      throw Object.assign(new Error("No active students in this arm"), {
        status: 400,
      });
    }

    const existing = await prisma.resultEpin.findMany({
      where: {
        schoolId: tenantId,
        academicYearId: opts.academicYearId,
        term: opts.term,
        studentId: { in: students.map((s) => s.id) },
      },
      select: { studentId: true },
    });
    const existingStudentIds = new Set(existing.map((e) => e.studentId));

    const expiresAt = opts.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    let created = 0;
    const errors: string[] = [];
    for (const student of students) {
      if (existingStudentIds.has(student.id)) continue; // already has a pin for this term
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        try {
          await prisma.resultEpin.create({
            data: {
              schoolId: tenantId,
              studentId: student.id,
              academicYearId: opts.academicYearId,
              term: opts.term,
              serial: generateSerial(),
              pin: generatePin(),
              maxUses: opts.maxUses ?? 5,
              expiresAt,
            },
          });
          created++;
          ok = true;
        } catch (err: any) {
          // P2002 = unique collision (serial or pin) — retry with new values
          if (err?.code !== "P2002") throw err;
          if (attempt === 4) errors.push(student.id);
        }
      }
    }

    return {
      generated: created,
      skipped: students.length - created,
      total: students.length,
      failedStudentIds: errors,
    };
  },

  /** List e-Pins for an arm + term (admin table view / export). */
  listForArm: async (opts: {
    armId: string;
    academicYearId: string;
    term: string;
  }): Promise<EpinRow[]> => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("Tenant context missing");

    const pins = await prisma.resultEpin.findMany({
      where: {
        schoolId: tenantId,
        academicYearId: opts.academicYearId,
        term: opts.term,
        student: { armId: opts.armId },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            admissionNumber: true,
            class: { select: { name: true } },
            arm: { select: { letter: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return pins.map((p) => ({
      id: p.id,
      serial: p.serial,
      pin: p.pin,
      studentId: p.studentId,
      studentName: p.student.name,
      admissionNumber: p.student.admissionNumber ?? null,
      className: p.student.class?.name ?? null,
      armLetter: p.student.arm?.letter ?? null,
      term: p.term,
      academicYearId: p.academicYearId,
      uses: p.uses,
      maxUses: p.maxUses,
      usedAt: p.usedAt ? p.usedAt.toISOString() : null,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    }));
  },

  /**
   * PUBLIC: redeem a serial + pin and return the student's term results.
   * Increments usage counters; rejects exhausted or expired pins.
   */
  checkResults: async (opts: { serial: string; pin: string }) => {
    const serial = opts.serial.trim().toUpperCase();
    const pin = opts.pin.trim().toUpperCase();

    // Serials are globally unique per school — no tenant context on this
    // public route, so look the row up directly.
    const record = await prisma.resultEpin.findFirst({
      where: { serial },
      include: {
        student: { select: { id: true, name: true, admissionNumber: true } },
      },
    });
    if (!record)
      throw Object.assign(new Error("Invalid serial number"), { status: 404 });
    if (record.pin !== pin)
      throw Object.assign(new Error("Incorrect PIN for this serial"), {
        status: 401,
      });
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw Object.assign(new Error("This e-Pin has expired"), { status: 410 });
    }
    if (record.uses >= record.maxUses) {
      throw Object.assign(
        new Error("This e-Pin has been used the maximum number of times"),
        { status: 429 },
      );
    }

    // Fetch term results for the student
    const results = await prisma.result.findMany({
      where: {
        studentId: record.studentId,
        academicYearId: record.academicYearId,
        term: record.term,
      },
      include: { subject: { select: { name: true } } },
      orderBy: { subjectId: "asc" },
    });

    // Increment usage (fire and forget would lose errors — await it)
    await prisma.resultEpin.update({
      where: { id: record.id },
      data: { uses: { increment: 1 }, usedAt: new Date() },
    });

    const totalScore = results.reduce((s, r) => s + r.total, 0);
    const average = results.length
      ? Math.round((totalScore / results.length) * 100) / 100
      : 0;

    return {
      student: {
        name: record.student.name,
        admissionNumber: record.student.admissionNumber,
      },
      term: record.term,
      remainingChecks: Math.max(0, record.maxUses - record.uses - 1),
      subjects: results.map((r) => ({
        subject: r.subject.name,
        ca1: r.ca1,
        ca2: r.ca2,
        ca3: r.ca3,
        ca: r.ca,
        exam: r.exam,
        total: r.total,
        grade: r.grade,
      })),
      totalScore,
      average,
    };
  },
};
