"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetController = void 0;
const budgetService_1 = require("../services/budgetService");
const budgetValidation_1 = require("../validations/budgetValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.budgetController = {
    getAllBudgets: async (req, res) => {
        try {
            const budgets = await budgetService_1.budgetService.getAllBudgets();
            res.json(budgets);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch budgets' });
        }
    },
    createBudget: async (req, res) => {
        try {
            const data = budgetValidation_1.createBudgetSchema.parse(req.body);
            const budget = await budgetService_1.budgetService.createBudget(data);
            res.status(201).json(budget);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.message?.includes('already exists')) {
                return res.status(409).json({ error: err.message });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to create budget' });
        }
    },
    updateBudget: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = budgetValidation_1.updateBudgetSchema.parse(req.body);
            const updated = await budgetService_1.budgetService.updateBudget(id, data);
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.message === 'Budget not found')
                return res.status(404).json({ error: err.message });
            if (err.message?.includes('already exists'))
                return res.status(409).json({ error: err.message });
            console.error(err);
            res.status(500).json({ error: 'Failed to update budget' });
        }
    },
    deleteBudget: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await budgetService_1.budgetService.deleteBudget(id);
            res.json({ message: 'Budget deleted' });
        }
        catch (err) {
            if (err.code === 'P2025')
                return res.status(404).json({ error: 'Budget not found' });
            console.error(err);
            res.status(500).json({ error: 'Failed to delete budget' });
        }
    },
};
