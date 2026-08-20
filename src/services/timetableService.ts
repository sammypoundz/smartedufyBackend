import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const timetableService = {
  // Arm ID must be a non‑null string (caller must validate)
  getByArmId: (armId: string) => {
    return prisma.timetableEntry.findMany({
      where: { armId },
      include: { subject: true },
      orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
    }); // middleware adds schoolId
  },

  getByTeacherId: async (teacherId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const teacherSubjects = await prisma.subjectArm.findMany({
      where: { teacherId, schoolId: tenantId },
      select: { armId: true, subjectId: true },
    });
    if (teacherSubjects.length === 0) return [];
    const orConditions = teacherSubjects.map(ts => ({
      AND: [{ armId: ts.armId }, { subjectId: ts.subjectId }],
    }));
    const entries = await prisma.timetableEntry.findMany({
      where: {
        OR: orConditions,
        // schoolId is added by middleware, but we can add it explicitly if needed
      },
      include: {
        subject: true,
        arm: { include: { class: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
    });
    return Array.from(new Map(entries.map(e => [e.id, e])).values());
  },

  replaceForArm: async (armId: string, entries: { dayOfWeek: string; timeSlot: string; subjectId?: string }[]) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const subjectIds = entries
      .map(e => e.subjectId)
      .filter((id): id is string => !!id);

    if (subjectIds.length === 0) {
      await prisma.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
      return [];
    }

    const subjectArms = await prisma.subjectArm.findMany({
      where: { armId, subjectId: { in: subjectIds }, schoolId: tenantId },
      select: { subjectId: true, teacherId: true },
    });
    const teacherMap = new Map<string, string>();
    for (const sa of subjectArms) {
      if (sa.teacherId) teacherMap.set(sa.subjectId, sa.teacherId);
    }

    const teacherIds = Array.from(new Set(teacherMap.values()));
    if (teacherIds.length === 0) {
      await prisma.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
      const createdEntries = [];
      for (const entry of entries) {
        const created = await prisma.timetableEntry.create({
          data: {
            armId,
            dayOfWeek: entry.dayOfWeek,
            timeSlot: entry.timeSlot,
            subjectId: entry.subjectId ?? null,
            schoolId: tenantId,
          },
        });
        createdEntries.push(created);
      }
      return createdEntries;
    }

    const teacherSubjectArms = await prisma.subjectArm.findMany({
      where: { teacherId: { in: teacherIds }, schoolId: tenantId },
      select: { armId: true, subjectId: true, teacherId: true },
    });
    const teacherArmSubjectMap = new Map<string, { teacherId: string }>();
    for (const tsa of teacherSubjectArms) {
      teacherArmSubjectMap.set(`${tsa.armId}|${tsa.subjectId}`, { teacherId: tsa.teacherId! });
    }

    const affectedArmIds = Array.from(new Set(teacherSubjectArms.map(tsa => tsa.armId)));
    // Only get entries from the same tenant (middleware will add schoolId, but we add explicitly)
    const existingEntries = await prisma.timetableEntry.findMany({
      where: {
        armId: { in: affectedArmIds },
        schoolId: tenantId,
      },
    });

    const existingConflictSet = new Set<string>();
    for (const entry of existingEntries) {
      const key = `${entry.armId}|${entry.subjectId}`;
      const mapping = teacherArmSubjectMap.get(key);
      if (mapping?.teacherId && entry.armId !== armId) {
        existingConflictSet.add(`${mapping.teacherId}|${entry.dayOfWeek}|${entry.timeSlot}`);
      }
    }

    for (const entry of entries) {
      if (!entry.subjectId) continue;
      const teacherId = teacherMap.get(entry.subjectId);
      if (!teacherId) continue;
      const conflictKey = `${teacherId}|${entry.dayOfWeek}|${entry.timeSlot}`;
      if (existingConflictSet.has(conflictKey)) {
        throw new Error(`Teacher conflict: Teacher ${teacherId} already has a lesson at ${entry.dayOfWeek} ${entry.timeSlot} in another arm.`);
      }
    }

    await prisma.timetableEntry.deleteMany({ where: { armId, schoolId: tenantId } });
    const createdEntries = [];
    for (const entry of entries) {
      const created = await prisma.timetableEntry.create({
        data: {
          armId,
          dayOfWeek: entry.dayOfWeek,
          timeSlot: entry.timeSlot,
          subjectId: entry.subjectId ?? null,
          schoolId: tenantId,
        },
      });
      createdEntries.push(created);
    }
    return createdEntries;
  },

  update: async (id: string, data: { dayOfWeek?: string; timeSlot?: string; subjectId?: string | null }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.timetableEntry.update({
      where: { id, schoolId: tenantId },
      data: {
        dayOfWeek: data.dayOfWeek,
        timeSlot: data.timeSlot,
        subjectId: data.subjectId,
      },
      include: { subject: true },
    });
  },

  delete: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.timetableEntry.delete({
      where: { id, schoolId: tenantId },
    });
  },
};