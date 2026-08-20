"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idParamSchema = exports.updateBackupSettingsSchema = exports.updateSecuritySettingsSchema = exports.updateNotificationSettingsSchema = exports.updateBankDetailsSchema = exports.updateTemplateSchema = exports.createTemplateSchema = exports.updatePromotionRuleSchema = exports.createPromotionRuleSchema = exports.updateAcademicSettingsSchema = exports.updateGeneralSettingsSchema = void 0;
const zod_1 = require("zod");
// ----- Global Settings -----
exports.updateGeneralSettingsSchema = zod_1.z.object({
    schoolName: zod_1.z.string().min(1).optional(),
    language: zod_1.z.string().optional(),
});
// ----- Academic Settings -----
// currentTermId is required – the service expects a non-optional string
exports.updateAcademicSettingsSchema = zod_1.z.object({
    currentTermId: zod_1.z.string().min(1, 'Term ID is required'),
});
// ----- Promotion Rules -----
exports.createPromotionRuleSchema = zod_1.z.object({
    fromClass: zod_1.z.string().min(1),
    toClass: zod_1.z.string().min(1),
    minAverage: zod_1.z.number().int().min(0).max(100),
    isAutomatic: zod_1.z.boolean().default(true),
});
exports.updatePromotionRuleSchema = exports.createPromotionRuleSchema.partial();
// ----- Report Card Templates -----
exports.createTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    isDefault: zod_1.z.boolean().default(false),
});
exports.updateTemplateSchema = exports.createTemplateSchema.partial();
// ----- Bank Details -----
exports.updateBankDetailsSchema = zod_1.z.object({
    bankName: zod_1.z.string().optional(),
    accountName: zod_1.z.string().optional(),
    accountNumber: zod_1.z.string().optional(),
    sortCode: zod_1.z.string().optional(),
});
// ----- Notification Settings -----
exports.updateNotificationSettingsSchema = zod_1.z.object({
    emailNotifications: zod_1.z.boolean().optional(),
    smsNotifications: zod_1.z.boolean().optional(),
});
// ----- Security Settings -----
exports.updateSecuritySettingsSchema = zod_1.z.object({
    twoFactorAuth: zod_1.z.boolean().optional(),
    sessionTimeout: zod_1.z.number().int().min(5).max(120).optional(),
});
// ----- Backup Settings -----
exports.updateBackupSettingsSchema = zod_1.z.object({
    autoBackup: zod_1.z.boolean().optional(),
});
// ----- Route Parameter Validation (optional but useful) -----
exports.idParamSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'ID is required'),
});
