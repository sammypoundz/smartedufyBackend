"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.questionService = {
    getByTestId: (testId) => db_1.default.question.findMany({
        where: { testId }, // middleware adds schoolId
        orderBy: { createdAt: 'asc' },
        include: { subject: true },
    }),
    getById: (id) => db_1.default.question.findUnique({
        where: { id }, // middleware adds schoolId
        include: { subject: true },
    }),
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        console.log('📥 questionService.create - received data:', JSON.stringify(data, null, 2));
        const result = db_1.default.question.create({
            data: {
                testId: data.testId,
                subjectId: data.subjectId ?? null,
                text: data.text,
                options: data.options,
                correctOption: data.correctOption,
                marks: data.marks,
                attachmentType: data.attachmentType ?? null,
                attachmentUrl: data.attachmentUrl ?? null,
                schoolId: tenantId, // 👈 required
            },
        });
        result.then(question => {
            console.log('✅ question created:', { id: question.id, subjectId: question.subjectId });
        }).catch(err => console.error('❌ Prisma create error:', err));
        return result;
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.question.update({
            where: { id, schoolId: tenantId },
            data: {
                subjectId: data.subjectId !== undefined ? data.subjectId : undefined,
                text: data.text,
                options: data.options,
                correctOption: data.correctOption,
                marks: data.marks,
                attachmentType: data.attachmentType !== undefined ? data.attachmentType : undefined,
                attachmentUrl: data.attachmentUrl !== undefined ? data.attachmentUrl : undefined,
            },
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.question.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
