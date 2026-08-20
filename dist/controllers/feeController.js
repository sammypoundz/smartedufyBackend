"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeController = void 0;
const feeService_1 = require("../services/feeService");
const feeValidation_1 = require("../validations/feeValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.feeController = {
    // Fee Structures
    getAllFeeStructures: async (req, res) => {
        try {
            const structures = await feeService_1.feeService.getAllFeeStructures();
            res.json(structures);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch fee structures' });
        }
    },
    createFeeStructure: async (req, res) => {
        try {
            const data = feeValidation_1.createFeeStructureSchema.parse(req.body);
            const deadline = new Date(data.deadline);
            const structure = await feeService_1.feeService.createFeeStructure({ ...data, deadline });
            res.status(201).json(structure);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to create fee structure' });
        }
    },
    updateFeeStructure: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = feeValidation_1.updateFeeStructureSchema.parse(req.body);
            const updatePayload = { ...data };
            if (data.deadline) {
                updatePayload.deadline = new Date(data.deadline);
            }
            const updated = await feeService_1.feeService.updateFeeStructure(id, updatePayload);
            if (!updated)
                return res.status(404).json({ error: 'Fee structure not found' });
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update fee structure' });
        }
    },
    deleteFeeStructure: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await feeService_1.feeService.deleteFeeStructure(id);
            res.json({ message: 'Fee structure deleted' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete fee structure' });
        }
    },
    // Payments
    getAllPayments: async (req, res) => {
        try {
            const { studentId, classId } = req.query;
            const payments = await feeService_1.feeService.getAllPayments({
                studentId: studentId,
                classId: classId,
            });
            res.json(payments);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch payments' });
        }
    },
    recordPayment: async (req, res) => {
        try {
            const data = feeValidation_1.recordPaymentSchema.parse(req.body);
            const payment = await feeService_1.feeService.recordPayment(data);
            res.status(201).json(payment);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: err.message || 'Failed to record payment' });
        }
    },
    // Student assigned fees (NEW)
    getStudentAssignedFees: async (req, res) => {
        const studentId = (0, paramUtils_1.getStringParam)(req.params.studentId);
        if (!studentId)
            return res.status(400).json({ error: 'Invalid student id' });
        try {
            const assignedFees = await feeService_1.feeService.getStudentAssignedFees(studentId);
            res.json(assignedFees);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch assigned fees' });
        }
    },
    // Messages
    sendMessage: async (req, res) => {
        try {
            const { studentId, type, subject, message } = feeValidation_1.sendMessageSchema.parse(req.body);
            const result = await feeService_1.feeService.sendMessage(studentId, type, subject, message);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to send message' });
        }
    },
};
