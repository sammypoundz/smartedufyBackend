"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const userService_1 = require("../services/userService");
const userValidation_1 = require("../validations/userValidation");
const paramUtils_1 = require("../utils/paramUtils");
exports.userController = {
    getAllUsers: async (req, res) => {
        try {
            const users = await userService_1.userService.getAllUsers();
            res.json(users);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    },
    getRecentUsers: async (req, res) => {
        const limit = parseInt(req.query.limit) || 5;
        try {
            const users = await userService_1.userService.getRecentUsers(limit);
            res.json(users);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch recent users' });
        }
    },
    getUserById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const user = await userService_1.userService.getUserById(id);
            if (!user)
                return res.status(404).json({ error: 'User not found' });
            res.json(user);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    },
    createUser: async (req, res) => {
        try {
            const data = userValidation_1.createUserSchema.parse(req.body);
            const user = await userService_1.userService.createUser(data);
            res.status(201).json(user);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.code === 'P2002')
                return res.status(409).json({ error: 'Email already exists' });
            console.error(err);
            res.status(500).json({ error: 'Failed to create user' });
        }
    },
    updateUser: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const data = userValidation_1.updateUserSchema.parse(req.body);
            const updated = await userService_1.userService.updateUser(id, data);
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.code === 'P2002')
                return res.status(409).json({ error: 'Email already exists' });
            if (err.code === 'P2025')
                return res.status(404).json({ error: 'User not found' });
            console.error(err);
            res.status(500).json({ error: 'Failed to update user' });
        }
    },
    deleteUser: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            await userService_1.userService.deleteUser(id);
            res.json({ message: 'User deleted' });
        }
        catch (err) {
            if (err.code === 'P2025')
                return res.status(404).json({ error: 'User not found' });
            console.error(err);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    },
    updateStatus: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const { isActive } = userValidation_1.updateStatusSchema.parse(req.body);
            const updated = await userService_1.userService.updateStatus(id, isActive);
            res.json(updated);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            if (err.code === 'P2025')
                return res.status(404).json({ error: 'User not found' });
            console.error(err);
            res.status(500).json({ error: 'Failed to update status' });
        }
    },
};
