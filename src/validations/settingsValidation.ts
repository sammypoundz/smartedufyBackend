import { z } from 'zod';

// ----- Global Settings -----
export const updateGeneralSettingsSchema = z.object({
  schoolName: z.string().min(1).optional(),
  language: z.string().optional(),
});

// ----- Academic Settings -----
// currentTermId is required – the service expects a non-optional string
export const updateAcademicSettingsSchema = z.object({
  currentTermId: z.string().min(1, 'Term ID is required'),
});

// ----- Promotion Rules -----
export const createPromotionRuleSchema = z.object({
  fromClass: z.string().min(1),
  toClass: z.string().min(1),
  minAverage: z.number().int().min(0).max(100),
  isAutomatic: z.boolean().default(true),
});
export const updatePromotionRuleSchema = createPromotionRuleSchema.partial();

// ----- Report Card Templates -----
export const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
});
export const updateTemplateSchema = createTemplateSchema.partial();

// ----- Bank Details -----
export const updateBankDetailsSchema = z.object({
  bankName: z.string().optional(),
  accountName: z.string().optional(),
  accountNumber: z.string().optional(),
  sortCode: z.string().optional(),
});

// ----- Notification Settings -----
export const updateNotificationSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
});

// ----- Security Settings -----
export const updateSecuritySettingsSchema = z.object({
  twoFactorAuth: z.boolean().optional(),
  sessionTimeout: z.number().int().min(5).max(120).optional(),
});

// ----- Backup Settings -----
export const updateBackupSettingsSchema = z.object({
  autoBackup: z.boolean().optional(),
});

// ----- Route Parameter Validation (optional but useful) -----
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});