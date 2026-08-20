"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.skillService = {
    // Global skill operations – middleware adds schoolId to where
    getAll: () => db_1.default.skill.findMany(),
    getById: async (id) => {
        if (!id)
            throw new Error('Skill ID is required');
        const skill = await db_1.default.skill.findUnique({
            where: { id }, // middleware adds schoolId
            include: {
                subjects: {
                    include: { subject: true },
                },
            },
        });
        if (!skill)
            throw new Error('Skill not found');
        return skill;
    },
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const createData = {
            name: data.name,
            schoolId: tenantId,
        };
        if (data.description !== undefined)
            createData.description = data.description;
        return db_1.default.skill.create({ data: createData });
    },
    update: async (id, data) => {
        if (!id)
            throw new Error('Skill ID is required');
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.description !== undefined)
            updateData.description = data.description;
        return db_1.default.skill.update({
            where: { id, schoolId: tenantId },
            data: updateData,
        });
    },
    delete: async (id) => {
        if (!id)
            throw new Error('Skill ID is required');
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.skill.delete({
            where: { id, schoolId: tenantId },
        });
    },
    // Arm-specific operations
    getByArmId: async (armId) => {
        const armSkills = await db_1.default.armSkill.findMany({
            where: { armId }, // middleware adds schoolId
            select: { skillId: true },
        });
        const skillIds = armSkills.map((as) => as.skillId);
        if (skillIds.length === 0)
            return [];
        return db_1.default.skill.findMany({
            where: { id: { in: skillIds } },
        });
    },
    linkToArm: async (skillId, armId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.armSkill.create({
            data: {
                skillId,
                armId,
                schoolId: tenantId,
            },
        });
    },
    removeFromArm: async (armId, skillId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.armSkill.deleteMany({
            where: {
                armId,
                skillId,
                schoolId: tenantId,
            },
        });
    },
    // Get skills by subject using SubjectSkill join table
    getBySubjectId: async (subjectId) => {
        const subjectSkills = await db_1.default.subjectSkill.findMany({
            where: { subjectId }, // middleware adds schoolId
            select: { skillId: true },
        });
        const skillIds = subjectSkills.map((ss) => ss.skillId);
        if (skillIds.length === 0)
            return [];
        return db_1.default.skill.findMany({
            where: { id: { in: skillIds } },
            orderBy: { name: 'asc' },
        });
    },
};
