import { prisma } from '../config/prisma';
import { getCurrentTenantId } from '../utils/tenantContext';

export const settingsService = {
  // ---------- Global Settings ----------
  getGeneralSettings: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const school = await prisma.school.findUnique({
      where: { id: tenantId },
      select: { name: true, subdomain: true },
    });
    const language = await prisma.globalSetting.findUnique({
      where: { key: 'language' },
    });
    return {
      schoolName: school?.name || '',
      language: language?.value || 'en',
    };
  },

  updateGeneralSettings: async (data: { schoolName?: string; language?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    if (data.schoolName) {
      await prisma.school.update({
        where: { id: tenantId },
        data: { name: data.schoolName },
      });
    }
    if (data.language) {
      await prisma.globalSetting.upsert({
        where: { key: 'language' },
        update: { value: data.language },
        create: { key: 'language', value: data.language },
      });
    }
    return { success: true };
  },

  // ---------- Academic Settings ----------
  getAcademicSettings: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: tenantId, isActive: true },
      include: { terms: true },
    });
    const currentTermIdSetting = await prisma.globalSetting.findUnique({
      where: { key: 'activeTermId' },
    });
    const currentTerm = activeYear?.terms.find(t => t.id === currentTermIdSetting?.value) || activeYear?.terms[0] || null;
    return {
      currentTerm: currentTerm ? `${currentTerm.name} ${activeYear?.name || ''}` : 'Not set',
      currentTermId: currentTerm?.id || null,
      academicYearId: activeYear?.id || null,
    };
  },

  updateAcademicSettings: async (data: { currentTermId: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const term = await prisma.term.findUnique({
      where: { id: data.currentTermId },
    });
    if (!term) throw new Error('Term not found');
    await prisma.globalSetting.upsert({
      where: { key: 'activeTermId' },
      update: { value: data.currentTermId },
      create: { key: 'activeTermId', value: data.currentTermId },
    });
    await prisma.academicYear.updateMany({
      where: { schoolId: tenantId },
      data: { isActive: false },
    });
    await prisma.academicYear.update({
      where: { id: term.academicYearId },
      data: { isActive: true },
    });
    return { success: true };
  },

  // ---------- Promotion Rules ----------
  getPromotionRules: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.promotionRule.findMany({
      where: { schoolId: tenantId },
      orderBy: { createdAt: 'asc' },
    });
  },

  createPromotionRule: async (data: { fromClass: string; toClass: string; minAverage: number; isAutomatic?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.promotionRule.create({
      data: { ...data, schoolId: tenantId },
    });
  },

  updatePromotionRule: async (id: string, data: Partial<{ fromClass: string; toClass: string; minAverage: number; isAutomatic: boolean }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.promotionRule.update({
      where: { id, schoolId: tenantId },
      data,
    });
  },

  deletePromotionRule: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    await prisma.promotionRule.delete({
      where: { id, schoolId: tenantId },
    });
    return { success: true };
  },

  // ---------- Report Card Templates ----------
  getTemplates: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    return prisma.reportCardTemplate.findMany({
      where: { schoolId: tenantId },
      orderBy: { createdAt: 'asc' },
    });
  },

  createTemplate: async (data: { name: string; description?: string; isDefault?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    const newTemplate = await prisma.reportCardTemplate.create({
      data: { ...data, schoolId: tenantId },
    });
    if (newTemplate.isDefault) {
      await prisma.reportCardTemplate.updateMany({
        where: { schoolId: tenantId, id: { not: newTemplate.id } },
        data: { isDefault: false },
      });
    }
    return newTemplate;
  },

  updateTemplate: async (id: string, data: Partial<{ name: string; description: string; isDefault: boolean }>) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    const updated = await prisma.reportCardTemplate.update({
      where: { id, schoolId: tenantId },
      data,
    });
    if (updated.isDefault) {
      await prisma.reportCardTemplate.updateMany({
        where: { schoolId: tenantId, id: { not: updated.id } },
        data: { isDefault: false },
      });
    }
    return updated;
  },

  deleteTemplate: async (id: string) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    await prisma.reportCardTemplate.delete({
      where: { id, schoolId: tenantId },
    });
    return { success: true };
  },

  // ---------- Bank Details (fixed) ----------
  getBankDetails: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');
    const bank = await prisma.bankDetail.findUnique({
      where: { schoolId: tenantId },
    });
    return bank || { bankName: '', accountName: '', accountNumber: '', sortCode: '' };
  },

  updateBankDetails: async (data: { bankName?: string; accountName?: string; accountNumber?: string; sortCode?: string }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    return prisma.bankDetail.upsert({
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
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const [email, sms] = await Promise.all([
      prisma.globalSetting.findUnique({ where: { key: 'emailNotifications' } }),
      prisma.globalSetting.findUnique({ where: { key: 'smsNotifications' } }),
    ]);
    return {
      emailNotifications: email?.value === 'true',
      smsNotifications: sms?.value === 'true',
    };
  },

  updateNotificationSettings: async (data: { emailNotifications?: boolean; smsNotifications?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updates = [];
    if (data.emailNotifications !== undefined) {
      updates.push(
        prisma.globalSetting.upsert({
          where: { key: 'emailNotifications' },
          update: { value: String(data.emailNotifications) },
          create: { key: 'emailNotifications', value: String(data.emailNotifications) },
        })
      );
    }
    if (data.smsNotifications !== undefined) {
      updates.push(
        prisma.globalSetting.upsert({
          where: { key: 'smsNotifications' },
          update: { value: String(data.smsNotifications) },
          create: { key: 'smsNotifications', value: String(data.smsNotifications) },
        })
      );
    }
    await Promise.all(updates);
    return { success: true };
  },

  // ---------- Security Settings ----------
  getSecuritySettings: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const [twoFactor, timeout] = await Promise.all([
      prisma.globalSetting.findUnique({ where: { key: 'twoFactorAuth' } }),
      prisma.globalSetting.findUnique({ where: { key: 'sessionTimeout' } }),
    ]);
    return {
      twoFactorAuth: twoFactor?.value === 'true',
      sessionTimeout: parseInt(timeout?.value || '30', 10),
    };
  },

  updateSecuritySettings: async (data: { twoFactorAuth?: boolean; sessionTimeout?: number }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const updates = [];
    if (data.twoFactorAuth !== undefined) {
      updates.push(
        prisma.globalSetting.upsert({
          where: { key: 'twoFactorAuth' },
          update: { value: String(data.twoFactorAuth) },
          create: { key: 'twoFactorAuth', value: String(data.twoFactorAuth) },
        })
      );
    }
    if (data.sessionTimeout !== undefined) {
      updates.push(
        prisma.globalSetting.upsert({
          where: { key: 'sessionTimeout' },
          update: { value: String(data.sessionTimeout) },
          create: { key: 'sessionTimeout', value: String(data.sessionTimeout) },
        })
      );
    }
    await Promise.all(updates);
    return { success: true };
  },

  // ---------- Backup Settings ----------
  getBackupSettings: async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    const backup = await prisma.globalSetting.findUnique({
      where: { key: 'autoBackup' },
    });
    return {
      autoBackup: backup?.value === 'true',
    };
  },

  updateBackupSettings: async (data: { autoBackup?: boolean }) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context missing');

    if (data.autoBackup !== undefined) {
      await prisma.globalSetting.upsert({
        where: { key: 'autoBackup' },
        update: { value: String(data.autoBackup) },
        create: { key: 'autoBackup', value: String(data.autoBackup) },
      });
    }
    return { success: true };
  },
};