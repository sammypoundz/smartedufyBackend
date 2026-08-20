"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessmentFormatService = void 0;
const db_1 = __importDefault(require("../config/db"));
const tenantContext_1 = require("../utils/tenantContext");
exports.assessmentFormatService = {
    /**
     * Get all assessment formats (scoped to the current tenant via middleware).
     */
    getAll: () => {
        return db_1.default.assessmentFormat.findMany({
            orderBy: { name: 'asc' },
        });
    },
    /**
     * Get a single assessment format by ID (scoped to the current tenant via middleware).
     */
    getById: (id) => {
        return db_1.default.assessmentFormat.findUnique({ where: { id } });
    },
    /**
     * Create a new assessment format.
     * Validates that CA + Exam = 100 and ensures the format name is unique per tenant.
     */
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const total = data.ca + data.exam;
        if (total !== 100)
            throw new Error('CA and Exam must sum to 100');
        // Check if format with same name already exists for this tenant
        const existing = await db_1.default.assessmentFormat.findFirst({
            where: { name: data.name, schoolId: tenantId },
        });
        if (existing) {
            throw new Error(`Assessment format "${data.name}" already exists for this school.`);
        }
        return db_1.default.assessmentFormat.create({
            data: {
                name: data.name,
                ca: data.ca,
                exam: data.exam,
                total,
                schoolId: tenantId,
            },
        });
    },
    /**
     * Update an existing assessment format.
     * Validates CA + Exam = 100 and ensures name uniqueness within the tenant.
     */
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Use transaction to fetch existing and perform atomic update
        return db_1.default.$transaction(async (tx) => {
            // Ensure record exists and belongs to this tenant
            const existing = await tx.assessmentFormat.findUnique({
                where: { id, schoolId: tenantId },
            });
            if (!existing)
                throw new Error('Assessment format not found or does not belong to this school');
            // Calculate new CA/Exam totals
            const newCa = data.ca ?? existing.ca;
            const newExam = data.exam ?? existing.exam;
            const total = newCa + newExam;
            if (total !== 100)
                throw new Error('CA and Exam must sum to 100');
            // If name is being changed, check for uniqueness within tenant
            if (data.name && data.name !== existing.name) {
                const duplicate = await tx.assessmentFormat.findFirst({
                    where: { name: data.name, schoolId: tenantId },
                });
                if (duplicate) {
                    throw new Error(`Assessment format "${data.name}" already exists for this school.`);
                }
            }
            return tx.assessmentFormat.update({
                where: { id, schoolId: tenantId },
                data: {
                    name: data.name,
                    ca: newCa,
                    exam: newExam,
                    total,
                },
            });
        });
    },
    /**
     * Delete an assessment format (must belong to the current tenant).
     */
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.assessmentFormat.delete({
            where: { id, schoolId: tenantId },
        });
    },
};
