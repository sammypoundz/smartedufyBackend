import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { settingsService } from '../services/settingsService';
import {
  updateGeneralSettingsSchema,
  updateAcademicSettingsSchema,
  createPromotionRuleSchema,
  updatePromotionRuleSchema,
  createTemplateSchema,
  updateTemplateSchema,
  updateBankDetailsSchema,
  updateNotificationSettingsSchema,
  updateSecuritySettingsSchema,
  updateBackupSettingsSchema,
} from '../validations/settingsValidation';

// Helper to get validated ID from params
const getParamId = (id: string | string[] | undefined): string => {
  if (!id) throw new Error('ID is required');
  if (Array.isArray(id)) return id[0];
  return id;
};

export const settingsController = {
  // ----- General -----
  getGeneral: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getGeneralSettings();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch general settings' });
    }
  },
  updateGeneral: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateGeneralSettingsSchema.parse(req.body);
      const result = await settingsService.updateGeneralSettings(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update general settings' });
    }
  },

  // ----- Academic -----
  getAcademic: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getAcademicSettings();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch academic settings' });
    }
  },
  updateAcademic: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateAcademicSettingsSchema.parse(req.body);
      const result = await settingsService.updateAcademicSettings(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update academic settings' });
    }
  },

  // ----- Promotion Rules -----
  getPromotionRules: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getPromotionRules();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch promotion rules' });
    }
  },
  createPromotionRule: async (req: AuthRequest, res: Response) => {
    try {
      const data = createPromotionRuleSchema.parse(req.body);
      const rule = await settingsService.createPromotionRule(data);
      res.status(201).json(rule);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to create promotion rule' });
    }
  },
  updatePromotionRule: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const data = updatePromotionRuleSchema.parse(req.body);
      const rule = await settingsService.updatePromotionRule(id, data);
      res.json(rule);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.message === 'Item not found' || err.message === 'ID is required') {
        return res.status(404).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to update promotion rule' });
    }
  },
  deletePromotionRule: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      await settingsService.deletePromotionRule(id);
      res.status(204).send();
    } catch (err: any) {
      if (err.message === 'ID is required') return res.status(400).json({ error: err.message });
      if (err.message === 'Item not found') return res.status(404).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Failed to delete promotion rule' });
    }
  },

  // ----- Templates -----
  getTemplates: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getTemplates();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch report card templates' });
    }
  },
  createTemplate: async (req: AuthRequest, res: Response) => {
    try {
      const data = createTemplateSchema.parse(req.body);
      const template = await settingsService.createTemplate(data);
      res.status(201).json(template);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to create template' });
    }
  },
  updateTemplate: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const data = updateTemplateSchema.parse(req.body);
      const template = await settingsService.updateTemplate(id, data);
      res.json(template);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      if (err.message === 'Item not found' || err.message === 'ID is required') {
        return res.status(404).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  },
  deleteTemplate: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      await settingsService.deleteTemplate(id);
      res.status(204).send();
    } catch (err: any) {
      if (err.message === 'ID is required') return res.status(400).json({ error: err.message });
      if (err.message === 'Item not found') return res.status(404).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  },

  // ----- Bank Details -----
  getBankDetails: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getBankDetails();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch bank details' });
    }
  },
  updateBankDetails: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateBankDetailsSchema.parse(req.body);
      const result = await settingsService.updateBankDetails(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update bank details' });
    }
  },

  // ----- Notifications -----
  getNotificationSettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getNotificationSettings();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch notification settings' });
    }
  },
  updateNotificationSettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateNotificationSettingsSchema.parse(req.body);
      const result = await settingsService.updateNotificationSettings(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update notification settings' });
    }
  },

  // ----- Security -----
  getSecuritySettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getSecuritySettings();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch security settings' });
    }
  },
  updateSecuritySettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateSecuritySettingsSchema.parse(req.body);
      const result = await settingsService.updateSecuritySettings(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update security settings' });
    }
  },

  // ----- Backup -----
  getBackupSettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = await settingsService.getBackupSettings();
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch backup settings' });
    }
  },
  updateBackupSettings: async (req: AuthRequest, res: Response) => {
    try {
      const data = updateBackupSettingsSchema.parse(req.body);
      const result = await settingsService.updateBackupSettings(data);
      res.json(result);
    } catch (err: any) {
      if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: 'Failed to update backup settings' });
    }
  },
};