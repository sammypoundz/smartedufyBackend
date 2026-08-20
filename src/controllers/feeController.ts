import { Request, Response } from 'express';
import { feeService } from '../services/feeService';
import { createFeeStructureSchema, updateFeeStructureSchema, recordPaymentSchema, sendMessageSchema } from '../validations/feeValidation';
import { getStringParam } from '../utils/paramUtils';

export const feeController = {
  // Fee Structures
  getAllFeeStructures: async (req: Request, res: Response) => {
    try {
      const structures = await feeService.getAllFeeStructures();
      res.json(structures);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch fee structures' });
    }
  },

  createFeeStructure: async (req: Request, res: Response) => {
    try {
      const data = createFeeStructureSchema.parse(req.body);
      const deadline = new Date(data.deadline);
      const structure = await feeService.createFeeStructure({ ...data, deadline });
      res.status(201).json(structure);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to create fee structure' });
    }
  },

  updateFeeStructure: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updateFeeStructureSchema.parse(req.body);
      const updatePayload: any = { ...data };
      if (data.deadline) {
        updatePayload.deadline = new Date(data.deadline);
      }
      const updated = await feeService.updateFeeStructure(id, updatePayload);
      if (!updated) return res.status(404).json({ error: 'Fee structure not found' });
      res.json(updated);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update fee structure' });
    }
  },

  deleteFeeStructure: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await feeService.deleteFeeStructure(id);
      res.json({ message: 'Fee structure deleted' });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete fee structure' });
    }
  },

  // Payments
  getAllPayments: async (req: Request, res: Response) => {
    try {
      const { studentId, classId } = req.query;
      const payments = await feeService.getAllPayments({
        studentId: studentId as string | undefined,
        classId: classId as string | undefined,
      });
      res.json(payments);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch payments' });
    }
  },

  recordPayment: async (req: Request, res: Response) => {
    try {
      const data = recordPaymentSchema.parse(req.body);
      const payment = await feeService.recordPayment(data);
      res.status(201).json(payment);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: err.message || 'Failed to record payment' });
    }
  },

  // Student assigned fees (NEW)
  getStudentAssignedFees: async (req: Request, res: Response) => {
    const studentId = getStringParam(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid student id' });
    try {
      const assignedFees = await feeService.getStudentAssignedFees(studentId);
      res.json(assignedFees);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch assigned fees' });
    }
  },

  // Messages
  sendMessage: async (req: Request, res: Response) => {
    try {
      const { studentId, type, subject, message } = sendMessageSchema.parse(req.body);
      const result = await feeService.sendMessage(studentId, type, subject, message);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  },
};