import { z } from 'zod';

// Breakdown item schema
const breakdownItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
});

// Fee structure creation / update
export const createFeeStructureSchema = z.object({
  className: z.string().min(1),
  term: z.string().min(1),
  breakdown: z.array(breakdownItemSchema).min(1),
  deadline: z.string().datetime(), // ISO date string
});

export const updateFeeStructureSchema = createFeeStructureSchema.partial();

// Payment record (itemised)
export const recordPaymentSchema = z.object({
  studentId: z.string().min(1),
  feeStructureId: z.string().min(1),
  amountPaid: z.number().positive(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card', 'cheque']),
  reference: z.string().optional(),
  breakdownItems: z.array(z.object({
    itemName: z.string(),
    amount: z.number().positive(),
  })).min(1),
});

// Message sending
export const sendMessageSchema = z.object({
  studentId: z.string().min(1),
  type: z.enum(['email', 'sms']),
  subject: z.string().optional(), // for email
  message: z.string().min(1),
});