"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryController = void 0;
const inventoryService_1 = require("../services/inventoryService");
const inventoryValidation_1 = require("../validations/inventoryValidation");
exports.inventoryController = {
    // Get all items (paginated + filters)
    getAll: async (req, res) => {
        try {
            const query = inventoryValidation_1.inventoryQuerySchema.parse(req.query);
            const result = await inventoryService_1.inventoryService.getAll(query);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            console.error('[inventory.getAll]', err);
            res.status(500).json({ error: 'Failed to fetch inventory items' });
        }
    },
    // Get one item
    getById: async (req, res) => {
        try {
            const id = req.params.id;
            if (!id) {
                return res.status(400).json({ error: 'Invalid ID' });
            }
            const item = await inventoryService_1.inventoryService.getById(id);
            res.json(item);
        }
        catch (err) {
            if (err.message === 'Item not found') {
                return res.status(404).json({ error: err.message });
            }
            console.error('[inventory.getById]', err);
            res.status(500).json({ error: 'Failed to fetch item' });
        }
    },
    // Create
    create: async (req, res) => {
        try {
            const data = inventoryValidation_1.createInventoryItemSchema.parse(req.body);
            const item = await inventoryService_1.inventoryService.create(data);
            res.status(201).json(item);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            console.error('[inventory.create]', err);
            res.status(500).json({ error: 'Failed to create item' });
        }
    },
    // Update
    update: async (req, res) => {
        try {
            const id = req.params.id;
            if (!id) {
                return res.status(400).json({ error: 'Invalid ID' });
            }
            const data = inventoryValidation_1.updateInventoryItemSchema.parse(req.body);
            const item = await inventoryService_1.inventoryService.update(id, data);
            res.json(item);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.message === 'Item not found') {
                return res.status(404).json({ error: err.message });
            }
            console.error('[inventory.update]', err);
            res.status(500).json({ error: 'Failed to update item' });
        }
    },
    // Delete
    delete: async (req, res) => {
        try {
            const id = req.params.id;
            if (!id) {
                return res.status(400).json({ error: 'Invalid ID' });
            }
            await inventoryService_1.inventoryService.delete(id);
            res.status(204).send();
        }
        catch (err) {
            if (err.message === 'Item not found') {
                return res.status(404).json({ error: err.message });
            }
            console.error('[inventory.delete]', err);
            res.status(500).json({ error: 'Failed to delete item' });
        }
    },
    // Stats
    getStats: async (req, res) => {
        try {
            const stats = await inventoryService_1.inventoryService.getStats();
            res.json(stats);
        }
        catch (err) {
            console.error('[inventory.getStats]', err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    },
};
