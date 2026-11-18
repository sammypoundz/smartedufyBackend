import prisma from '../config/db';
import { getCurrentTenantId } from '../utils/tenantContext';
import { syncService } from './syncService';

function getGradeLetterFromScales(score: number, scales: { minScore: number; maxScore: number; grade: string }[]): string {
  for (const scale of scales) {
    if (score >= scale.minScore && score <= scale.maxScore) {
      return scale.grade;
    }
  }
  return '?';
}

export const subjectService = {
  // ---------- Global subject operations ----------
  getAll: () =>
    prisma.subject.findMany({
      include: { teachers: true, arms: true },
      orderBy: { name: 'asc' },
    }), // middleware adds schoolId

  getById: (id: string | null | undefined) => {
    if (!id) throw new Error('Subject ID is required');
    return prisma.subject.findUnique({
      where: { id },
      include: { teachers: true, arms: true },
    }); // middleware adds schoolId
  },

  getByIdWithArm: async (subjectId: string, armId: string) => {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        arms: {
          where: { armId },
          include: {
            teacher: true,
            arm: {
              include: {
                class: true,
              },
            },
          },
        },
      },
    }); // middleware adds schoolId

    if (!subject) return null;

    const armData = subject.arms[0];
    return {
      id: subject.id,
      name: subject.name,
      description: subject.description,
      teacher: armData?.teacher ? {
        id: armData.teacher.id,
        name: armData.teacher.name,
        email: armData.teacher.email,
      } : null,
      class: armData?.arm?.class ? {
        id: armData.arm.class.id,
        name: armData.arm.class.name,
      } : null,
      arm: armData?.arm ? {
        id: armData.arm.id,
        letter: armData.arm.letter,
      } : null,
    };
  },

  create: async (name: string, description?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.subject.create({
      data: {
        name,
        description,
        schoolId: tenantId,
      },
    });
  },

  update: async (id: string | null | undefined, name?: string, description?: string) => {
    if (!id) throw new Error('Subject ID is required');
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.subject.update({
      where: { id, schoolId: tenantId },
      data: { name, description },
    });
  },

  delete: async (id: string | null | undefined) => {
    if (!id) throw new Error('Subject ID is required');
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.subject.delete({
      where: { id, schoolId: tenantId },
    });
  },

  // ---------- Arm‑specific subject operations ----------
  getByArmId: (armId: string) =>
    prisma.subject.findMany({
      where: { arms: { some: { armId } } },
      include: {
        arms: {
          where: { armId },
          include: { teacher: true },
        },
      },
    }), // middleware adds schoolId

  linkToArm: async (subjectId: string, armId: string, teacherId?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    await syncService.validateSubjectArmLink(tenantId, subjectId, armId, teacherId);

    // Idempotent: never duplicate a subject-arm link
    const existing = await prisma.subjectArm.findFirst({
      where: { schoolId: tenantId, subjectId, armId },
    });
    let link;
    if (existing) {
      link = await prisma.subjectArm.update({
        where: { id: existing.id, schoolId: tenantId },
        data: { teacherId: teacherId ?? existing.teacherId },
      });
    } else {
      link = await prisma.subjectArm.create({
        data: { subjectId, armId, teacherId, schoolId: tenantId },
      });
    }
    if (teacherId) {
      await syncService.ensureSubjectTeacher(prisma, tenantId, subjectId, teacherId);
    }
    await syncService.syncStudentSubjectsForArm(tenantId, armId);
    return link;
  },

  /**
   * Bulk-create subjects with validation.
   * Returns per-row results so the caller can report created/duplicates.
   */
  bulkCreate: async (
    names: { name: string; description?: string }[],
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const results: {
      name: string;
      status: 'created' | 'duplicate_in_payload' | 'already_exists';
      subject?: { id: string; name: string; description?: string | null };
    }[] = [];

    const seen = new Set<string>();

    for (const row of names) {
      const key = row.name.trim().toLowerCase();
      if (!key) {
        results.push({ name: row.name, status: 'duplicate_in_payload' });
        continue;
      }
      if (seen.has(key)) {
        results.push({ name: row.name, status: 'duplicate_in_payload' });
        continue;
      }
      seen.add(key);

      const existing = await prisma.subject.findFirst({
        where: { schoolId: tenantId, name: row.name.trim() },
      });
      if (existing) {
        results.push({
          name: row.name,
          status: 'already_exists',
          subject: { id: existing.id, name: existing.name, description: existing.description },
        });
        continue;
      }

      const subject = await prisma.subject.create({
        data: {
          name: row.name.trim(),
          description: row.description?.trim() || null,
          schoolId: tenantId,
        },
      });
      results.push({
        name: row.name,
        status: 'created',
        subject: { id: subject.id, name: subject.name, description: subject.description },
      });
    }

    return results;
  },

  /**
   * Bulk-link subjects to arms (idempotent, validates every pair).
   * Returns per-pair results.
   */
  bulkLinkToArms: async (
    subjectIds: string[],
    armIds: string[],
    teacherId?: string,
  ) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const arms = await prisma.arm.findMany({
      where: { id: { in: armIds }, schoolId: tenantId },
      select: { id: true },
    });
    const validArmIds = new Set(arms.map((a) => a.id));

    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds }, schoolId: tenantId },
      select: { id: true },
    });
    const validSubjectIds = new Set(subjects.map((s) => s.id));

    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: teacherId, schoolId: tenantId },
      });
      if (!teacher) throw new Error('Teacher not found in this school');
    }

    const existingLinks = await prisma.subjectArm.findMany({
      where: { schoolId: tenantId, subjectId: { in: subjectIds }, armId: { in: armIds } },
      select: { subjectId: true, armId: true },
    });
    const linkKey = (sid: string, aid: string) => `${sid}|${aid}`;
    const existingKeys = new Set(existingLinks.map((l) => linkKey(l.subjectId, l.armId)));

    const results: { subjectId: string; armId: string; status: 'linked' | 'already_assigned' | 'invalid_subject' | 'invalid_arm' }[] = [];

    for (const armId of armIds) {
      for (const subjectId of subjectIds) {
        if (!validSubjectIds.has(subjectId)) {
          results.push({ subjectId, armId, status: 'invalid_subject' });
          continue;
        }
        if (!validArmIds.has(armId)) {
          results.push({ subjectId, armId, status: 'invalid_arm' });
          continue;
        }
        if (existingKeys.has(linkKey(subjectId, armId))) {
          results.push({ subjectId, armId, status: 'already_assigned' });
          continue;
        }
        existingKeys.add(linkKey(subjectId, armId));
        await prisma.subjectArm.create({
          data: { subjectId, armId, teacherId, schoolId: tenantId },
        });
        if (teacherId) {
          await syncService.ensureSubjectTeacher(prisma, tenantId, subjectId, teacherId);
        }
        await syncService.syncStudentSubjectsForArm(tenantId, armId);
        results.push({ subjectId, armId, status: 'linked' });
      }
    }

    return results;
  },

  updateArmSubject: async (id: string, teacherId?: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId: tenantId } });
      if (!teacher) throw new Error('Teacher not found in this school');
    }

    const previous = await prisma.subjectArm.findFirst({ where: { id, schoolId: tenantId } });
    const updated = await prisma.subjectArm.update({
      where: { id, schoolId: tenantId },
      data: { teacherId },
      include: { subject: true, teacher: true },
    });

    if (teacherId) {
      await syncService.ensureSubjectTeacher(prisma, tenantId, updated.subjectId, teacherId);
    }
    if (previous?.teacherId && previous.teacherId !== teacherId) {
      await syncService.pruneSubjectTeachers(prisma, tenantId, previous.subjectId, previous.teacherId);
    }
    return updated;
  },

  removeFromArm: async (armId: string, subjectId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relations = await prisma.subjectArm.findMany({
      where: { armId, subjectId, schoolId: tenantId },
    });
    const removed = await prisma.subjectArm.deleteMany({
      where: { armId, subjectId, schoolId: tenantId },
    });

    for (const r of relations) {
      if (r.teacherId) {
        await syncService.pruneSubjectTeachers(prisma, tenantId, subjectId, r.teacherId);
      }
    }
    await prisma.studentSubject.deleteMany({
      where: { schoolId: tenantId, subjectId, student: { armId } },
    });
    return removed;
  },

  deleteSubjectArm: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const relation = await prisma.subjectArm.findFirst({ where: { id, schoolId: tenantId } });
    const removed = await prisma.subjectArm.delete({ where: { id, schoolId: tenantId } });
    if (relation?.teacherId) {
      await syncService.pruneSubjectTeachers(prisma, tenantId, relation.subjectId, relation.teacherId);
    }
    if (relation) {
      await prisma.studentSubject.deleteMany({
        where: { schoolId: tenantId, subjectId: relation.subjectId, student: { armId: relation.armId } },
      });
    }
    return removed;
  },

  // ---------- Curriculum (topics) – full CRUD ----------
  getCurriculum: async (subjectId: string, armId: string) => {
    try {
      const topics = await prisma.topic.findMany({
        where: { subjectId, armId },
        orderBy: { dueDate: 'asc' },
      }); // middleware adds schoolId
      return topics;
    } catch (error) {
      console.warn('Topic model not found or not implemented yet');
      return [];
    }
  },

  createTopic: async (subjectId: string, armId: string, data: { title: string; description?: string; dueDate?: Date; completed?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.topic.create({
      data: {
        subjectId,
        armId,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        completed: data.completed ?? false,
        schoolId: tenantId,
      },
    });
  },

  updateTopic: async (topicId: string, data: { title?: string; description?: string; dueDate?: Date; completed?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.topic.update({
      where: { id: topicId, schoolId: tenantId },
      data,
    });
  },

  updateTopicCompletion: async (subjectId: string, topicId: string, completed: boolean) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const topic = await prisma.topic.findFirst({
      where: { id: topicId, subjectId, schoolId: tenantId },
    });
    if (!topic) throw new Error('Topic not found for this subject');
    return prisma.topic.update({
      where: { id: topicId, schoolId: tenantId },
      data: { completed },
    });
  },

  deleteTopic: async (topicId: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.topic.delete({
      where: { id: topicId, schoolId: tenantId },
    });
  },

  // ---------- Performance data – scoped to arm (via student's armId) ----------
  getPerformance: async (subjectId: string, armId: string) => {
    try {
      const gradingScales = await prisma.gradingScale.findMany({
        orderBy: { minScore: 'desc' },
        select: { minScore: true, maxScore: true, grade: true },
      }); // middleware adds schoolId
      if (gradingScales.length === 0) {
        console.warn('No grading scales defined. Please configure grading scales in settings.');
        return null;
      }

      const results = await prisma.result.findMany({
        where: {
          subjectId,
          student: { armId },
        },
        select: { score: true, term: true },
        orderBy: { term: 'desc' },
      }); // middleware adds schoolId

      if (results.length === 0) return null;

      const totalScore = results.reduce((sum, r) => sum + r.score, 0);
      const averageScore = Math.round(totalScore / results.length);
      const gradeLetter = getGradeLetterFromScales(averageScore, gradingScales);

      const termMap = new Map<string, { count: number; avgScore: number }>();
      for (const r of results) {
        if (!termMap.has(r.term)) {
          termMap.set(r.term, { count: 1, avgScore: r.score });
        } else {
          const existing = termMap.get(r.term)!;
          existing.count++;
          existing.avgScore = (existing.avgScore + r.score) / existing.count;
        }
      }
      const recentTerms = Array.from(termMap.keys()).slice(0, 5);
      const recentAssessments = recentTerms.map(term => ({
        name: `Assessment – ${term}`,
        score: `${Math.round(termMap.get(term)!.avgScore)}/100`,
        grade: getGradeLetterFromScales(termMap.get(term)!.avgScore, gradingScales),
        date: term,
      }));

      const assignmentsCompleted = results.length;
      const totalAssignments = assignmentsCompleted;

      return {
        currentGrade: averageScore,
        gradeLetter,
        assignmentsCompleted,
        totalAssignments,
        recentAssessments,
      };
    } catch (error) {
      console.error('Error fetching performance data:', error);
      return null;
    }
  },
};