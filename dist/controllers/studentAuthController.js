"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentAuthController = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
exports.studentAuthController = {
    login: async (req, res) => {
        const { admissionNumber, armId } = req.body;
        if (!admissionNumber || !armId) {
            return res.status(400).json({ error: 'Admission number and arm ID are required' });
        }
        try {
            // Find student by admission number and arm, including schoolId and relations
            const student = await db_1.default.student.findFirst({
                where: {
                    admissionNumber,
                    armId,
                },
                include: {
                    arm: { include: { class: true } },
                    school: { select: { id: true, name: true } }, // 👈 include school
                },
            });
            if (!student) {
                return res.status(404).json({ error: 'Student not found in this arm' });
            }
            // Ensure the student has a schoolId (should always be the case)
            if (!student.schoolId) {
                return res.status(400).json({ error: 'Student is not associated with a school' });
            }
            // Generate JWT token with schoolId
            const token = jsonwebtoken_1.default.sign({
                id: student.id,
                role: 'STUDENT',
                admissionNumber: student.admissionNumber,
                schoolId: student.schoolId, // 👈 added
            }, process.env.JWT_SECRET, { expiresIn: '2h' });
            // Return token + student info, including school info for tenant header
            res.json({
                token,
                student: {
                    id: student.id,
                    name: student.name,
                    admissionNumber: student.admissionNumber,
                    className: student.arm?.class?.name,
                    armLetter: student.arm?.letter,
                    schoolId: student.schoolId,
                    schoolName: student.school?.name,
                },
            });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Login failed' });
        }
    },
};
