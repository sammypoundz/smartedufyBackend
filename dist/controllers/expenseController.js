"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseController = void 0;
const expenseService_1 = require("../services/expenseService");
const expenseValidation_1 = require("../validations/expenseValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.expenseController = {
    getAll: async (req, res) => {
        try {
            const expenses = await expenseService_1.expenseService.getAll();
            res.json(expenses);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch expenses' });
        }
    },
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const expense = await expenseService_1.expenseService.getById(id);
            if (!expense)
                return res.status(404).json({ error: 'Expense not found' });
            res.json(expense);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch expense' });
        }
    },
    create: async (req, res) => {
        try {
            const data = expenseValidation_1.createExpenseSchema.parse(req.body);
            const expense = await expenseService_1.expenseService.create({
                ...data,
                date: new Date(data.date),
            });
            res.status(201).json(expense);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to create expense' });
        }
    },
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = expenseValidation_1.updateExpenseSchema.parse(req.body);
            const updatePayload = { ...data };
            if (data.date)
                updatePayload.date = new Date(data.date);
            const updated = await expenseService_1.expenseService.update(id, updatePayload);
            if (!updated)
                return res.status(404).json({ error: 'Expense not found' });
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update expense' });
        }
    },
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await expenseService_1.expenseService.delete(id);
            res.json({ message: 'Expense deleted' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete expense' });
        }
    },
};
