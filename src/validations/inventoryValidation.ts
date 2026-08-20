import { z } from 'zod';

const statusEnum = z.enum(['Good', 'Needs Repair', 'Broken', 'Low Stock']);
const categoryEnum = z.enum(['Furniture', 'Electronics', 'Books', 'Science', 'Sports']);

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  quantity: z.number().int().min(0, 'Quantity must be 0 or more'),
  category: categoryEnum,
  status: statusEnum,
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(0).optional(),
  category: categoryEnum.optional(),
  status: statusEnum.optional(),
});

export const inventoryQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});