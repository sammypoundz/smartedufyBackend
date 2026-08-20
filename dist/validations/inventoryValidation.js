"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryQuerySchema = exports.updateInventoryItemSchema = exports.createInventoryItemSchema = void 0;
const zod_1 = require("zod");
const statusEnum = zod_1.z.enum(['Good', 'Needs Repair', 'Broken', 'Low Stock']);
const categoryEnum = zod_1.z.enum(['Furniture', 'Electronics', 'Books', 'Science', 'Sports']);
exports.createInventoryItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    quantity: zod_1.z.number().int().min(0, 'Quantity must be 0 or more'),
    category: categoryEnum,
    status: statusEnum,
});
exports.updateInventoryItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    quantity: zod_1.z.number().int().min(0).optional(),
    category: categoryEnum.optional(),
    status: statusEnum.optional(),
});
exports.inventoryQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(10),
});
