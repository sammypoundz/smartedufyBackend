"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffController = void 0;
const staffService_1 = require("../services/staffService");
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const XLSX = __importStar(require("xlsx"));
const paramUtils_1 = require("../utils/paramUtils");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const SALT_ROUNDS = 10;
const STAFF_ROLES = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'BURSAR', 'ACCOUNTANT', 'LIBRARIAN'];
const roleMap = {
    Principal: 'PRINCIPAL',
    Teacher: 'TEACHER',
    Accountant: 'ACCOUNTANT',
    Admin: 'ADMIN',
    Librarian: 'LIBRARIAN',
    Bursar: 'BURSAR',
};
// Zod schema for creating/updating staff
const createStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    role: zod_1.z.string(),
    teacherType: zod_1.z.string().optional(),
    assignedClass: zod_1.z.string().optional(),
    assignedSubjects: zod_1.z.any().optional(), // can be array or JSON string
});
// Helper to safely parse assignedSubjects
const parseAssignedSubjects = (subjects) => {
    if (!subjects)
        return [];
    if (Array.isArray(subjects))
        return subjects;
    if (typeof subjects === 'string') {
        try {
            const parsed = JSON.parse(subjects);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
};
exports.staffController = {
    // GET all staff
    getAll: async (req, res) => {
        try {
            const staff = await staffService_1.staffService.getAllStaff();
            res.json(staff);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch staff' });
        }
    },
    // GET single staff
    getById: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const staff = await staffService_1.staffService.getStaffById(id);
            if (!staff)
                return res.status(404).json({ error: 'Staff not found' });
            res.json(staff);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch staff' });
        }
    },
    // CREATE staff
    create: async (req, res) => {
        try {
            // Validate with Zod
            const validated = createStaffSchema.parse(req.body);
            const { name, email, role, teacherType, assignedClass, assignedSubjects } = validated;
            const enumRole = roleMap[role];
            if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
                return res.status(400).json({ error: 'Invalid staff role' });
            }
            // Check if email exists
            const existing = await db_1.default.user.findUnique({ where: { email } });
            if (existing)
                return res.status(400).json({ error: 'Email already in use' });
            const rawPassword = 'password123'; // In production, generate random
            const hashedPassword = await bcryptjs_1.default.hash(rawPassword, SALT_ROUNDS);
            const subjectsArray = parseAssignedSubjects(assignedSubjects);
            const staff = await staffService_1.staffService.createStaff({
                name,
                email,
                role: enumRole,
                hashedPassword,
                teacherType,
                assignedClass,
                assignedSubjects: subjectsArray,
            });
            res.status(201).json(staff);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to create staff' });
        }
    },
    // UPDATE staff
    update: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            // Use Zod for validation (optional fields)
            const validated = createStaffSchema.partial().parse(req.body);
            const { name, email, role, teacherType, assignedClass, assignedSubjects } = validated;
            let enumRole;
            if (role) {
                enumRole = roleMap[role];
                if (!enumRole || !STAFF_ROLES.includes(enumRole)) {
                    return res.status(400).json({ error: 'Invalid staff role' });
                }
            }
            const subjectsArray = parseAssignedSubjects(assignedSubjects);
            const staff = await staffService_1.staffService.updateStaff(id, {
                name,
                email,
                role: enumRole,
                teacherType,
                assignedClass,
                assignedSubjects: subjectsArray,
            });
            if (!staff)
                return res.status(404).json({ error: 'Staff not found' });
            res.json(staff);
        }
        catch (err) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.errors });
            }
            if (err.message === 'Staff not found') {
                return res.status(404).json({ error: 'Staff not found' });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to update staff' });
        }
    },
    // DELETE staff
    delete: async (req, res) => {
        const id = (0, paramUtils_1.getStringParam)(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        try {
            const result = await staffService_1.staffService.deleteStaff(id);
            res.json(result);
        }
        catch (err) {
            if (err.message === 'Staff not found') {
                return res.status(404).json({ error: 'Staff not found' });
            }
            console.error(err);
            res.status(500).json({ error: 'Failed to delete staff' });
        }
    },
    // BULK UPLOAD
    bulkUpload: async (req, res) => {
        try {
            const file = req.file;
            if (!file)
                return res.status(400).json({ error: 'No file uploaded' });
            const workbook = XLSX.readFile(file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            // Process each row through service
            const results = await staffService_1.staffService.bulkCreateStaff(rows);
            res.json({
                message: `Processed ${rows.length} rows. Created ${results.created.length}, errors ${results.errors.length}`,
                created: results.created,
                errors: results.errors,
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Bulk upload failed' });
        }
    },
    // GENERATE REGISTRATION LINK
    generateLink: async (req, res) => {
        const token = crypto_1.default.randomUUID();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const link = `${frontendUrl}/register?token=${token}`;
        res.json({ link });
    },
};
