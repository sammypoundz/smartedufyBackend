"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promotionService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.promotionService = {
    promoteStudents: async (sourceArmId, targetArmId, studentIds, academicYearId, termId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // If studentIds not provided, get all students from source arm (scoped to tenant)
        let studentsToPromote = studentIds;
        if (!studentsToPromote) {
            const students = await db_1.default.student.findMany({
                where: {
                    armId: sourceArmId,
                    schoolId: tenantId, // 👈 scope to tenant
                },
                select: { id: true },
            });
            studentsToPromote = students.map(s => s.id);
        }
        else {
            // Validate that provided students belong to the source arm and tenant
            const validStudents = await db_1.default.student.findMany({
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
        if (studentsToPromote.length === 0)
            return { promoted: 0 };
        // Update each student's armId to targetArmId (scope update with schoolId)
        const updatePromises = studentsToPromote.map(studentId => db_1.default.student.update({
            where: { id: studentId, schoolId: tenantId }, // explicit scope
            data: { armId: targetArmId },
        }));
        await Promise.all(updatePromises);
        // Record history if academicYearId and termId are provided
        if (academicYearId && termId) {
            const historyPromises = studentsToPromote.map(studentId => db_1.default.studentPromotionHistory.create({
                data: {
                    studentId,
                    fromArmId: sourceArmId,
                    toArmId: targetArmId,
                    academicYearId,
                    termId,
                    schoolId: tenantId, // 👈 required
                },
            }));
            await Promise.all(historyPromises);
        }
        return { promoted: studentsToPromote.length };
    },
};
