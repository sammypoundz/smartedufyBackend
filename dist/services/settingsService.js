"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsService = void 0;
const prisma_1 = require("../config/prisma");
const tenantContext_1 = require("../utils/tenantContext");
exports.settingsService = {
    // ---------- Global Settings ----------
    getGeneralSettings: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const school = await prisma_1.prisma.school.findUnique({
            where: { id: tenantId },
            select: { name: true, subdomain: true },
        });
        const language = await prisma_1.prisma.globalSetting.findUnique({
            where: { key: 'language' },
        });
        return {
            schoolName: school?.name || '',
            language: language?.value || 'en',
        };
    },
    updateGeneralSettings: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (data.schoolName) {
            await prisma_1.prisma.school.update({
                where: { id: tenantId },
                data: { name: data.schoolName },
            });
        }
        if (data.language) {
            await prisma_1.prisma.globalSetting.upsert({
                where: { key: 'language' },
                update: { value: data.language },
                create: { key: 'language', value: data.language },
            });
        }
        return { success: true };
    },
    // ---------- Academic Settings ----------
    getAcademicSettings: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const activeYear = await prisma_1.prisma.academicYear.findFirst({
            where: { schoolId: tenantId, isActive: true },
            include: { terms: true },
        });
        const currentTermIdSetting = await prisma_1.prisma.globalSetting.findUnique({
            where: { key: 'activeTermId' },
        });
        const currentTerm = activeYear?.terms.find(t => t.id === currentTermIdSetting?.value) || activeYear?.terms[0] || null;
        return {
            currentTerm: currentTerm ? `${currentTerm.name} ${activeYear?.name || ''}` : 'Not set',
            currentTermId: currentTerm?.id || null,
            academicYearId: activeYear?.id || null,
        };
    },
    updateAcademicSettings: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const term = await prisma_1.prisma.term.findUnique({
            where: { id: data.currentTermId },
        });
        if (!term)
            throw new Error('Term not found');
        await prisma_1.prisma.globalSetting.upsert({
            where: { key: 'activeTermId' },
            update: { value: data.currentTermId },
            create: { key: 'activeTermId', value: data.currentTermId },
        });
        await prisma_1.prisma.academicYear.updateMany({
            where: { schoolId: tenantId },
            data: { isActive: false },
        });
        await prisma_1.prisma.academicYear.update({
            where: { id: term.academicYearId },
            data: { isActive: true },
        });
        return { success: true };
    },
    // ---------- Promotion Rules ----------
    getPromotionRules: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.promotionRule.findMany({
            where: { schoolId: tenantId },
            orderBy: { createdAt: 'asc' },
        });
    },
    createPromotionRule: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.promotionRule.create({
            data: { ...data, schoolId: tenantId },
        });
    },
    updatePromotionRule: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.promotionRule.update({
            where: { id, schoolId: tenantId },
            data,
        });
    },
    deletePromotionRule: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await prisma_1.prisma.promotionRule.delete({
            where: { id, schoolId: tenantId },
        });
        return { success: true };
    },
    // ---------- Report Card Templates ----------
    getTemplates: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.reportCardTemplate.findMany({
            where: { schoolId: tenantId },
            orderBy: { createdAt: 'asc' },
        });
    },
    createTemplate: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const newTemplate = await prisma_1.prisma.reportCardTemplate.create({
            data: { ...data, schoolId: tenantId },
        });
        if (newTemplate.isDefault) {
            await prisma_1.prisma.reportCardTemplate.updateMany({
                where: { schoolId: tenantId, id: { not: newTemplate.id } },
                data: { isDefault: false },
            });
        }
        return newTemplate;
    },
    updateTemplate: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updated = await prisma_1.prisma.reportCardTemplate.update({
            where: { id, schoolId: tenantId },
            data,
        });
        if (updated.isDefault) {
            await prisma_1.prisma.reportCardTemplate.updateMany({
                where: { schoolId: tenantId, id: { not: updated.id } },
                data: { isDefault: false },
            });
        }
        return updated;
    },
    deleteTemplate: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        await prisma_1.prisma.reportCardTemplate.delete({
            where: { id, schoolId: tenantId },
        });
        return { success: true };
    },
    // ---------- Bank Details (fixed) ----------
    getBankDetails: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const bank = await prisma_1.prisma.bankDetail.findUnique({
            where: { schoolId: tenantId },
        });
        return bank || { bankName: '', accountName: '', accountNumber: '', sortCode: '' };
    },
    updateBankDetails: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return prisma_1.prisma.bankDetail.upsert({
            where: { schoolId: tenantId },
            update: {
                bankName: data.bankName,
                accountName: data.accountName,
                accountNumber: data.accountNumber,
                sortCode: data.sortCode,
            },
            create: {
                schoolId: tenantId,
                bankName: data.bankName ?? '',
                accountName: data.accountName ?? '',
                accountNumber: data.accountNumber ?? '',
                sortCode: data.sortCode ?? '',
            },
        });
    },
    // ---------- Notification Settings ----------
    getNotificationSettings: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const [email, sms] = await Promise.all([
            prisma_1.prisma.globalSetting.findUnique({ where: { key: 'emailNotifications' } }),
            prisma_1.prisma.globalSetting.findUnique({ where: { key: 'smsNotifications' } }),
        ]);
        return {
            emailNotifications: email?.value === 'true',
            smsNotifications: sms?.value === 'true',
        };
    },
    updateNotificationSettings: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updates = [];
        if (data.emailNotifications !== undefined) {
            updates.push(prisma_1.prisma.globalSetting.upsert({
                where: { key: 'emailNotifications' },
                update: { value: String(data.emailNotifications) },
                create: { key: 'emailNotifications', value: String(data.emailNotifications) },
            }));
        }
        if (data.smsNotifications !== undefined) {
            updates.push(prisma_1.prisma.globalSetting.upsert({
                where: { key: 'smsNotifications' },
                update: { value: String(data.smsNotifications) },
                create: { key: 'smsNotifications', value: String(data.smsNotifications) },
            }));
        }
        await Promise.all(updates);
        return { success: true };
    },
    // ---------- Security Settings ----------
    getSecuritySettings: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const [twoFactor, timeout] = await Promise.all([
            prisma_1.prisma.globalSetting.findUnique({ where: { key: 'twoFactorAuth' } }),
            prisma_1.prisma.globalSetting.findUnique({ where: { key: 'sessionTimeout' } }),
        ]);
        return {
            twoFactorAuth: twoFactor?.value === 'true',
            sessionTimeout: parseInt(timeout?.value || '30', 10),
        };
    },
    updateSecuritySettings: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const updates = [];
        if (data.twoFactorAuth !== undefined) {
            updates.push(prisma_1.prisma.globalSetting.upsert({
                where: { key: 'twoFactorAuth' },
                update: { value: String(data.twoFactorAuth) },
                create: { key: 'twoFactorAuth', value: String(data.twoFactorAuth) },
            }));
        }
        if (data.sessionTimeout !== undefined) {
            updates.push(prisma_1.prisma.globalSetting.upsert({
                where: { key: 'sessionTimeout' },
                update: { value: String(data.sessionTimeout) },
                create: { key: 'sessionTimeout', value: String(data.sessionTimeout) },
            }));
        }
        await Promise.all(updates);
        return { success: true };
    },
    // ---------- Backup Settings ----------
    getBackupSettings: async () => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const backup = await prisma_1.prisma.globalSetting.findUnique({
            where: { key: 'autoBackup' },
        });
        return {
            autoBackup: backup?.value === 'true',
        };
    },
    updateBackupSettings: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (data.autoBackup !== undefined) {
            await prisma_1.prisma.globalSetting.upsert({
                where: { key: 'autoBackup' },
                update: { value: String(data.autoBackup) },
                create: { key: 'autoBackup', value: String(data.autoBackup) },
            });
        }
        return { success: true };
    },
};
