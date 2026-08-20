"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = void 0;
const prisma_1 = require("../config/prisma");
const tenantContext_1 = require("../utils/tenantContext");
exports.inventoryService = {
    // Get all items with filters, pagination
    getAll: async (filters) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const where = { schoolId: tenantId };
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { category: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.category)
            where.category = filters.category;
        if (filters.status)
            where.status = filters.status;
        const skip = (filters.page - 1) * filters.limit;
        const [data, total] = await Promise.all([
            prisma_1.prisma.inventoryItem.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: filters.limit,
            }),
            prisma_1.prisma.inventoryItem.count({ where }),
        ]);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    },
    // Get one item
    getById: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const item = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id, schoolId: tenantId },
        });
        if (!item)
            throw new Error('Item not found');
        return item;
    },
    // Create
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.inventoryItem.create({
            data: {
                ...data,
                schoolId: tenantId,
            },
        });
    },
    // Update
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const item = await prisma_1.prisma.inventoryItem.update({
            where: { id, schoolId: tenantId },
            data,
        });
        return item;
    },
    // Delete
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await prisma_1.prisma.inventoryItem.delete({
            where: { id, schoolId: tenantId },
        });
        return { success: true };
    },
    // Stats
    getStats: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const items = await prisma_1.prisma.inventoryItem.findMany({
            where: { schoolId: tenantId },
        });
        const totalItems = items.length;
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const lowStockItems = items.filter(item => item.quantity < 10).length;
        const categories = new Set(items.map(item => item.category)).size;
        return {
            totalItems,
            totalQuantity,
            lowStockItems,
            categories,
        };
    },
};
