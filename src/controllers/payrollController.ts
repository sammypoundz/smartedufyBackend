import { Request, Response } from 'express';
import { payrollService } from '../services/payrollService';
import { createPayrollSchema, updatePayrollSchema } from '../validations/payrollValidation';
import { getStringParam } from '../utils/paramUtils';

const STAFF_ROLES = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT'];

export const payrollController = {
  getAllPayroll: async (req: Request, res: Response) => {
    try {
      const payroll = await payrollService.getAllPayroll();
      const transformed = payroll.map(p => ({
        id: p.id,
        staffId: p.staffId,
        staffName: p.staffName,
        role: p.role,
        amount: p.amount,
        month: p.month,
        status: p.status,
        paymentDate: p.paymentDate ? p.paymentDate.toISOString() : undefined,
        notes: p.notes,
      }));
      res.json(transformed);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch payroll' });
    }
  },

  getStaffForPayroll: async (req: Request, res: Response) => {
    try {
      const roles = (req.query.roles as string)?.split(',') || STAFF_ROLES;
      const staff = await payrollService.getStaffForPayroll(roles);
      res.json(staff);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch staff list' });
    }
  },

  createPayroll: async (req: Request, res: Response) => {
    try {
      const data = createPayrollSchema.parse(req.body);
      const created = await payrollService.createPayroll(data);
      res.status(201).json({
        id: created.id,
        staffId: created.staffId,
        staffName: created.staffName,
        role: created.role,
        amount: created.amount,
        month: created.month,
        status: created.status,
        paymentDate: created.paymentDate?.toISOString(),
        notes: created.notes,
      });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.message?.includes('already exists')) return res.status(409).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Failed to create payroll entry' });
    }
  },

  updatePayroll: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      const data = updatePayrollSchema.parse(req.body);
      const updated = await payrollService.updatePayroll(id, data);
      res.json({
        id: updated.id,
        staffId: updated.staffId,
        staffName: updated.staffName,
        role: updated.role,
        amount: updated.amount,
        month: updated.month,
        status: updated.status,
        paymentDate: updated.paymentDate?.toISOString(),
        notes: updated.notes,
      });
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.code === 'P2025') return res.status(404).json({ error: 'Payroll entry not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to update payroll entry' });
    }
  },

  deletePayroll: async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await payrollService.deletePayroll(id);
      res.json({ message: 'Payroll entry deleted' });
    } catch (err: any) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Payroll entry not found' });
      console.error(err);
      res.status(500).json({ error: 'Failed to delete payroll entry' });
    }
  },
};