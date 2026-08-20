"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = void 0;
const settingsService_1 = require("../services/settingsService");
const settingsValidation_1 = require("../validations/settingsValidation");
// Helper to get validated ID from params
const getParamId = (id) => {
    if (!id)
        throw new Error('ID is required');
    if (Array.isArray(id))
        return id[0];
    return id;
};
exports.settingsController = {
    // ----- General -----
    getGeneral: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getGeneralSettings();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch general settings' });
        }
    },
    updateGeneral: async (req, res) => {
        try {
            const data = settingsValidation_1.updateGeneralSettingsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateGeneralSettings(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update general settings' });
        }
    },
    // ----- Academic -----
    getAcademic: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getAcademicSettings();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch academic settings' });
        }
    },
    updateAcademic: async (req, res) => {
        try {
            const data = settingsValidation_1.updateAcademicSettingsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateAcademicSettings(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update academic settings' });
        }
    },
    // ----- Promotion Rules -----
    getPromotionRules: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getPromotionRules();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch promotion rules' });
        }
    },
    createPromotionRule: async (req, res) => {
        try {
            const data = settingsValidation_1.createPromotionRuleSchema.parse(req.body);
            const rule = await settingsService_1.settingsService.createPromotionRule(data);
            res.status(201).json(rule);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to create promotion rule' });
        }
    },
    updatePromotionRule: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            const data = settingsValidation_1.updatePromotionRuleSchema.parse(req.body);
            const rule = await settingsService_1.settingsService.updatePromotionRule(id, data);
            res.json(rule);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.message === 'Item not found' || err.message === 'ID is required') {
                return res.status(404).json({ error: err.message });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to update promotion rule' });
        }
    },
    deletePromotionRule: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            await settingsService_1.settingsService.deletePromotionRule(id);
            res.status(204).send();
        }
        catch (err) {
            if (err.message === 'ID is required')
                return res.status(400).json({ error: err.message });
            if (err.message === 'Item not found')
                return res.status(404).json({ error: err.message });
            console.error(err);
            res.status(500).json({ error: 'Failed to delete promotion rule' });
        }
    },
    // ----- Templates -----
    getTemplates: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getTemplates();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch report card templates' });
        }
    },
    createTemplate: async (req, res) => {
        try {
            const data = settingsValidation_1.createTemplateSchema.parse(req.body);
            const template = await settingsService_1.settingsService.createTemplate(data);
            res.status(201).json(template);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to create template' });
        }
    },
    updateTemplate: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            const data = settingsValidation_1.updateTemplateSchema.parse(req.body);
            const template = await settingsService_1.settingsService.updateTemplate(id, data);
            res.json(template);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.message === 'Item not found' || err.message === 'ID is required') {
                return res.status(404).json({ error: err.message });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to update template' });
        }
    },
    deleteTemplate: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            await settingsService_1.settingsService.deleteTemplate(id);
            res.status(204).send();
        }
        catch (err) {
            if (err.message === 'ID is required')
                return res.status(400).json({ error: err.message });
            if (err.message === 'Item not found')
                return res.status(404).json({ error: err.message });
            console.error(err);
            res.status(500).json({ error: 'Failed to delete template' });
        }
    },
    // ----- Bank Details -----
    getBankDetails: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getBankDetails();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch bank details' });
        }
    },
    updateBankDetails: async (req, res) => {
        try {
            const data = settingsValidation_1.updateBankDetailsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateBankDetails(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update bank details' });
        }
    },
    // ----- Notifications -----
    getNotificationSettings: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getNotificationSettings();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch notification settings' });
        }
    },
    updateNotificationSettings: async (req, res) => {
        try {
            const data = settingsValidation_1.updateNotificationSettingsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateNotificationSettings(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update notification settings' });
        }
    },
    // ----- Security -----
    getSecuritySettings: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getSecuritySettings();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch security settings' });
        }
    },
    updateSecuritySettings: async (req, res) => {
        try {
            const data = settingsValidation_1.updateSecuritySettingsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateSecuritySettings(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update security settings' });
        }
    },
    // ----- Backup -----
    getBackupSettings: async (req, res) => {
        try {
            const data = await settingsService_1.settingsService.getBackupSettings();
            res.json(data);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch backup settings' });
        }
    },
    updateBackupSettings: async (req, res) => {
        try {
            const data = settingsValidation_1.updateBackupSettingsSchema.parse(req.body);
            const result = await settingsService_1.settingsService.updateBackupSettings(data);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Failed to update backup settings' });
        }
    },
};
