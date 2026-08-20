"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
function getGradeLetterFromScales(score, scales) {
    for (const scale of scales) {
        if (score >= scale.minScore && score <= scale.maxScore) {
            return scale.grade;
        }
    }
    return '?';
}
exports.subjectService = {
    // ---------- Global subject operations ----------
    getAll: () => db_1.default.subject.findMany({
        include: { teachers: true, arms: true },
        orderBy: { name: 'asc' },
    }), // middleware adds schoolId
    getById: (id) => {
        if (!id)
            throw new Error('Subject ID is required');
        return db_1.default.subject.findUnique({
            where: { id },
            include: { teachers: true, arms: true },
        }); // middleware adds schoolId
    },
    getByIdWithArm: async (subjectId, armId) => {
        const subject = await db_1.default.subject.findUnique({
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
        if (!subject)
            return null;
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
    create: async (name, description) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subject.create({
            data: {
                name,
                description,
                schoolId: tenantId,
            },
        });
    },
    update: async (id, name, description) => {
        if (!id)
            throw new Error('Subject ID is required');
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subject.update({
            where: { id, schoolId: tenantId },
            data: { name, description },
        });
    },
    delete: async (id) => {
        if (!id)
            throw new Error('Subject ID is required');
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subject.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // ---------- Arm‑specific subject operations ----------
    getByArmId: (armId) => db_1.default.subject.findMany({
        where: { arms: { some: { armId } } },
        include: {
            arms: {
                where: { armId },
                include: { teacher: true },
            },
        },
    }), // middleware adds schoolId
    linkToArm: async (subjectId, armId, teacherId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.create({
            data: {
                subjectId,
                armId,
                teacherId,
                schoolId: tenantId,
            },
        });
    },
    updateArmSubject: async (id, teacherId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.update({
            where: { id, schoolId: tenantId },
            data: { teacherId },
            include: { subject: true, teacher: true },
        });
    },
    removeFromArm: async (armId, subjectId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.deleteMany({
            where: {
                armId,
                subjectId,
                schoolId: tenantId,
            },
        });
    },
    deleteSubjectArm: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.subjectArm.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // ---------- Curriculum (topics) – full CRUD ----------
    getCurriculum: async (subjectId, armId) => {
        try {
            const topics = await db_1.default.topic.findMany({
                where: { subjectId, armId },
                orderBy: { dueDate: 'asc' },
            }); // middleware adds schoolId
            return topics;
        }
        catch (error) {
            console.warn('Topic model not found or not implemented yet');
            return [];
        }
    },
    createTopic: async (subjectId, armId, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.topic.create({
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
    updateTopic: async (topicId, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.topic.update({
            where: { id: topicId, schoolId: tenantId },
            data,
        });
    },
    updateTopicCompletion: async (subjectId, topicId, completed) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const topic = await db_1.default.topic.findFirst({
            where: { id: topicId, subjectId, schoolId: tenantId },
        });
        if (!topic)
            throw new Error('Topic not found for this subject');
        return db_1.default.topic.update({
            where: { id: topicId, schoolId: tenantId },
            data: { completed },
        });
    },
    deleteTopic: async (topicId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.topic.delete({
            where: { id: topicId, schoolId: tenantId },
        });
    },
    // ---------- Performance data – scoped to arm (via student's armId) ----------
    getPerformance: async (subjectId, armId) => {
        try {
            const gradingScales = await db_1.default.gradingScale.findMany({
                orderBy: { minScore: 'desc' },
                select: { minScore: true, maxScore: true, grade: true },
            }); // middleware adds schoolId
            if (gradingScales.length === 0) {
                console.warn('No grading scales defined. Please configure grading scales in settings.');
                return null;
            }
            const results = await db_1.default.result.findMany({
                where: {
                    subjectId,
                    student: { armId },
                },
                select: { score: true, term: true },
                orderBy: { term: 'desc' },
            }); // middleware adds schoolId
            if (results.length === 0)
                return null;
            const totalScore = results.reduce((sum, r) => sum + r.score, 0);
            const averageScore = Math.round(totalScore / results.length);
            const gradeLetter = getGradeLetterFromScales(averageScore, gradingScales);
            const termMap = new Map();
            for (const r of results) {
                if (!termMap.has(r.term)) {
                    termMap.set(r.term, { count: 1, avgScore: r.score });
                }
                else {
                    const existing = termMap.get(r.term);
                    existing.count++;
                    existing.avgScore = (existing.avgScore + r.score) / existing.count;
                }
            }
            const recentTerms = Array.from(termMap.keys()).slice(0, 5);
            const recentAssessments = recentTerms.map(term => ({
                name: `Assessment – ${term}`,
                score: `${Math.round(termMap.get(term).avgScore)}/100`,
                grade: getGradeLetterFromScales(termMap.get(term).avgScore, gradingScales),
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
        }
        catch (error) {
            console.error('Error fetching performance data:', error);
            return null;
        }
    },
};
