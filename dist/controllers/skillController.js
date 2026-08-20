"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillController = void 0;
const skillService_1 = require("../services/skillService");
const skillValidation_1 = require("../validations/skillValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.skillController = {
    // Get all skills (global)
    getAll: async (req, res) => {
        try {
            const skills = await skillService_1.skillService.getAll();
            res.json(skills);
        }
        catch (err) {
            console.error('Get all skills error:', err);
            res.status(500).json({ error: 'Failed to fetch skills' });
        }
    },
    // Get a single skill by ID
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const skill = await skillService_1.skillService.getById(id);
            if (!skill)
                return res.status(404).json({ error: 'Skill not found' });
            res.json(skill);
        }
        catch (err) {
            console.error('Get skill by ID error:', err);
            res.status(500).json({ error: 'Failed to fetch skill' });
        }
    },
    // Get skills for a specific arm
    getByArmId: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        try {
            const skills = await skillService_1.skillService.getByArmId(armId);
            res.json(skills);
        }
        catch (err) {
            console.error('Get skills by arm error:', err);
            res.status(500).json({ error: 'Failed to fetch skills for arm' });
        }
    },
    // NEW: Get skills by subject (for taughtIn relation)
    getBySubjectId: async (req, res) => {
        const subjectId = (0, paramUtils_1.getStringParam)(req.params.subjectId);
        if (!subjectId)
            return res.status(400).json({ error: 'Invalid subject id' });
        try {
            const skills = await skillService_1.skillService.getBySubjectId(subjectId);
            res.json(skills);
        }
        catch (err) {
            console.error('Get skills by subject error:', err);
            res.status(500).json({ error: 'Failed to fetch skills for subject' });
        }
    },
    // Add a skill to an arm (either existing skill or new)
    addToArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        if (!armId)
            return res.status(400).json({ error: 'Invalid armId' });
        const { name, description, skillId } = req.body;
        try {
            let skill;
            if (skillId) {
                skill = await skillService_1.skillService.getById(skillId);
                if (!skill)
                    return res.status(404).json({ error: 'Skill not found' });
            }
            else {
                if (!name)
                    return res.status(400).json({ error: 'Skill name is required' });
                skill = await skillService_1.skillService.create({ name, description });
            }
            await skillService_1.skillService.linkToArm(skill.id, armId);
            res.status(201).json(skill);
        }
        catch (err) {
            console.error('Add skill to arm error:', err);
            res.status(500).json({ error: 'Failed to add skill to arm' });
        }
    },
    // Remove a skill from an arm
    removeFromArm: async (req, res) => {
        const armId = (0, paramUtils_1.getStringParam)(req.params.armId);
        const skillId = (0, paramUtils_1.getStringParam)(req.params.skillId);
        if (!armId || !skillId)
            return res.status(400).json({ error: 'Invalid armId or skillId' });
        try {
            await skillService_1.skillService.removeFromArm(armId, skillId);
            res.json({ message: 'Skill removed from arm' });
        }
        catch (err) {
            console.error('Remove skill from arm error:', err);
            res.status(500).json({ error: 'Failed to remove skill from arm' });
        }
    },
    // Create a new global skill
    create: async (req, res) => {
        try {
            const data = skillValidation_1.createSkillSchema.parse(req.body);
            const newSkill = await skillService_1.skillService.create(data);
            res.status(201).json(newSkill);
        }
        catch (err) {
            console.error('Create skill error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to create skill' });
        }
    },
    // Update a global skill (handles both PATCH and PUT)
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = skillValidation_1.updateSkillSchema.parse(req.body);
            const updated = await skillService_1.skillService.update(id, data);
            if (!updated)
                return res.status(404).json({ error: 'Skill not found' });
            res.json(updated);
        }
        catch (err) {
            console.error('Update skill error:', err);
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            res.status(500).json({ error: 'Failed to update skill' });
        }
    },
    // Delete a global skill
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await skillService_1.skillService.delete(id);
            res.json({ message: 'Skill deleted' });
        }
        catch (err) {
            console.error('Delete skill error:', err);
            res.status(500).json({ error: 'Failed to delete skill' });
        }
    },
};
