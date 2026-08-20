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
          schoolId: tenantId, // 👈 scope to tenant
        },
        select: { id: true },
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
        select: { id: true },
      });
      if (validStudents.length !== studentsToPromote.length) {
        throw new Error('Some students are not in the source arm or do not belong to this tenant');
      }
    }

    if (studentsToPromote.length === 0) return { promoted: 0 };

    // Update each student's armId to targetArmId (scope update with schoolId)
    const updatePromises = studentsToPromote.map(studentId =>
      prisma.student.update({
        where: { id: studentId, schoolId: tenantId }, // explicit scope
        data: { armId: targetArmId },
      })
    );
    await Promise.all(updatePromises);

    // Record history if academicYearId and termId are provided
    if (academicYearId && termId) {
      const historyPromises = studentsToPromote.map(studentId =>
        prisma.studentPromotionHistory.create({
          data: {
            studentId,
            fromArmId: sourceArmId,
            toArmId: targetArmId,
            academicYearId,
            termId,
            schoolId: tenantId, // 👈 required
          },
        })
      );
      await Promise.all(historyPromises);
    }

    return { promoted: studentsToPromote.length };
  },
};