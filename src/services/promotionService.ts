import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';

export const promotionService = {
  promoteStudents: async (
    sourceArmId: string,
    targetArmId: string,
    studentIds?: string[],
    academicYearId?: string,
    termId?: string
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    // If studentIds not provided, get all students from source arm (scoped to tenant)
    let studentsToPromote = studentIds;
    if (!studentsToPromote) {
      const students = await prisma.student.findMany({
        where: {
          armId: sourceArmId,
          schoolId: tenantId,
        },
        select: { id: true, classId: true },
      });
      studentsToPromote = students.map(s => s.id);
    } else {
      // Validate that provided students belong to the source arm and tenant
      const validStudents = await prisma.student.findMany({
        where: {
          id: { in: studentsToPromote },
          armId: sourceArmId,
          schoolId: tenantId,
        },
        select: { id: true, classId: true },
      });
      if (validStudents.length !== studentsToPromote.length) {
        throw new Error('Some students are not in the source arm or do not belong to this tenant');
      }
      studentsToPromote = validStudents.map(s => s.id);
    }

    if (studentsToPromote.length === 0) return { promoted: 0 };

    // Resolve the target arm's class so the student's classId is moved too.
    // (Otherwise a stale classId keeps the student appearing in the old class - duplicates.)
    const targetArm = await prisma.arm.findUnique({
      where: { id: targetArmId },
      select: { id: true, classId: true, schoolId: true },
    });
    if (!targetArm || targetArm.schoolId !== tenantId) {
      throw new Error('Target arm not found or does not belong to this tenant');
    }

    // Fetch the students being promoted (with their current classId for history)
    const promotedStudents = await prisma.student.findMany({
      where: { id: { in: studentsToPromote }, schoolId: tenantId },
      select: { id: true, classId: true },
    });

    // Atomically move each student into the new class + arm and record history.
    // A transaction guarantees no half-promoted (duplicated) state.
    await prisma.$transaction([
      ...promotedStudents.map(student =>
        prisma.student.update({
          where: { id: student.id, schoolId: tenantId },
          data: {
            armId: targetArmId,
            classId: targetArm.classId, // clears the old-class linkage
          },
        })
      ),
      ...(academicYearId && termId
        ? promotedStudents.map(student =>
            prisma.studentPromotionHistory.create({
              data: {
                studentId: student.id,
                fromArmId: sourceArmId,
                fromClassId: student.classId,
                toArmId: targetArmId,
                toClassId: targetArm.classId,
                academicYearId,
                termId,
                schoolId: tenantId,
              },
            })
          )
        : []),
    ]);

    return { promoted: promotedStudents.length };
  },

  // ---------- Bulk promotion across a configured flow ----------
  // flow: [{ fromArmId, toArmId, omitStudentIds? }]
  bulkPromoteStudents: async (
    flow: { fromArmId: string; toArmId: string; omitStudentIds?: string[] }[],
    academicYearId: string,
    termId: string
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    if (!flow || flow.length === 0) throw new Error('Promotion flow is empty');

    // ---- Conflict validation ----
    // 1. A source arm may only appear once in the flow
    const sourceIds = flow.map(f => f.fromArmId);
    const dupSources = sourceIds.filter((id, i) => sourceIds.indexOf(id) !== i);
    if (dupSources.length > 0) {
      throw new Error('Conflict: one or more classes appear more than once as a source');
    }
    // 2. A target arm may only receive students once
    const targetIds = flow.map(f => f.toArmId);
    const dupTargets = targetIds.filter((id, i) => targetIds.indexOf(id) !== i);
    if (dupTargets.length > 0) {
      throw new Error('Conflict: one or more target classes receive students from more than one source');
    }
    // 3. No target may be a source in the same run (students would be moved twice)
    const targetAsSource = targetIds.filter(t => sourceIds.includes(t));
    if (targetAsSource.length > 0) {
      throw new Error('Conflict: a target class is also a source class in this run. Configure the flow so each class moves to the next level directly.');
    }
    // 4. Source and target must not be the same arm
    const selfLoop = flow.find(f => f.fromArmId === f.toArmId);
    if (selfLoop) {
      throw new Error('Conflict: a class cannot be promoted into itself');
    }

    // Resolve all arms up-front (target class for classId move, source letter for labels)
    const armIds = Array.from(new Set([...sourceIds, ...targetIds]));
    const arms = await prisma.arm.findMany({
      where: { id: { in: armIds }, schoolId: tenantId },
      select: { id: true, classId: true, letter: true },
    });
    const armMap = new Map(arms.map(a => [a.id, a]));
    for (const id of armIds) {
      if (!armMap.has(id)) throw new Error('One or more classes do not exist or do not belong to this tenant');
    }

    // Fetch students per source arm, excluding omitted ones
    const moves: { studentId: string; classId: string; fromArmId: string; fromClassId: string | null; toArmId: string }[] = [];
    const history: { studentId: string; fromArmId: string; fromClassId: string | null; toArmId: string; toClassId: string }[] = [];
    const summary: { fromArmId: string; toArmId: string; count: number }[] = [];

    for (const step of flow) {
      const targetArm = armMap.get(step.toArmId)!;
      const omit = new Set(step.omitStudentIds || []);
      const students = await prisma.student.findMany({
        where: { armId: step.fromArmId, schoolId: tenantId },
        select: { id: true, classId: true },
      });
      const eligible = students.filter(s => !omit.has(s.id));
      for (const s of eligible) {
        moves.push({ studentId: s.id, classId: targetArm.classId, fromArmId: step.fromArmId, fromClassId: s.classId, toArmId: step.toArmId });
        history.push({
          studentId: s.id,
          fromArmId: step.fromArmId,
          fromClassId: s.classId,
          toArmId: step.toArmId,
          toClassId: targetArm.classId,
        });
      }
      summary.push({ fromArmId: step.fromArmId, toArmId: step.toArmId, count: eligible.length });
    }

    if (moves.length === 0) return { promoted: 0, summary };

    // Store targetArmId alongside moves for the history records
    const moveOps = moves.map(m => ({
      update: prisma.student.update({
        where: { id: m.studentId, schoolId: tenantId },
        data: { armId: m.toArmId, classId: m.classId },
      }),
      history: prisma.studentPromotionHistory.create({
        data: {
          studentId: m.studentId,
          fromArmId: m.fromArmId,
          fromClassId: m.fromClassId,
          toArmId: m.toArmId,
          toClassId: m.classId,
          academicYearId,
          termId,
          schoolId: tenantId,
        },
      }),
    }));

    // Single atomic transaction: every move + every history record together
    await prisma.$transaction(moveOps.flatMap(op => [op.update, op.history]));

    return { promoted: moves.length, summary };
  },
};
