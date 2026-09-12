"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentService = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantContext_1 = require("../utils/tenantContext");
const syncService_1 = require("./syncService");
exports.studentService = {
    // ---------- Existing methods ----------
    getAll: async (armId) => {
        const where = {};
        if (armId)
            where.armId = armId;
        return db_1.default.student.findMany({
            where,
            include: { parent: true, class: true, arm: { include: { class: true } }, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getByArmId: (armId) => {
        if (!armId)
            throw new Error('Arm ID is required');
        return db_1.default.student.findMany({
            where: { armId },
            include: { parent: true, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getByClassId: (classId) => {
        if (!classId)
            throw new Error('Class ID is required');
        return db_1.default.student.findMany({
            where: { classId },
            include: { parent: true, arm: true, user: { select: { email: true } } },
            orderBy: { name: 'asc' },
        }); // middleware adds schoolId
    },
    getById: (id) => {
        if (!id)
            throw new Error('Student ID is required');
        return db_1.default.student.findUnique({
            where: { id },
            include: { parent: true, class: true, arm: true, attendance: true, results: true },
        }); // middleware adds schoolId
    },
    getByUserId: (userId) => {
        if (!userId)
            throw new Error('User ID is required');
        return db_1.default.student.findUnique({
            where: { userId },
            include: {
                arm: { include: { class: true } },
                user: { select: { email: true, role: true } },
                parent: true,
            },
        }); // middleware adds schoolId
    },
    findByAdmissionAndArm: (admissionNumber, armId) => {
        return db_1.default.student.findFirst({
            where: { admissionNumber, armId },
            include: { arm: { include: { class: true } } },
        }); // middleware adds schoolId
    },
    create: async (data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        const email = `${data.name.toLowerCase().replace(/\s/g, '.')}@student.smartedufy.com`;
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
        // Reuse an existing account for this email if it has no student profile yet
        // (e.g. orphaned accounts left behind by a previous upload/cleanup). Otherwise
        // the unique email constraint would make every re-upload fail silently.
        let user = await db_1.default.user.findUnique({ where: { email } });
        if (user) {
            const linkedStudent = await db_1.default.student.findUnique({ where: { userId: user.id } });
            if (linkedStudent) {
                throw new Error(`Student "${data.name}" already exists (login: ${email}). If this is a re-upload, use a different name or remove the duplicate.`);
            }
            if (user.schoolId !== tenantId) {
                throw new Error(`A user with email ${email} already exists in another school.`);
            }
        }
        else {
            user = await db_1.default.user.create({
                data: {
                    name: data.name,
                    email,
                    password: hashedPassword,
                    role: 'STUDENT',
                    isActive: true,
                    schoolId: tenantId,
                },
            });
        }
        return db_1.default.student.create({
            data: {
                name: data.name,
                gender: data.gender || '',
                admissionNumber: data.admissionNumber,
                classId: data.classId,
                armId: data.armId,
                userId: user.id,
                schoolId: tenantId,
            },
            include: { parent: true },
        });
    },
    async createParentWithUser(parentData) {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        let user = await db_1.default.user.findUnique({ where: { email: parentData.email } });
        if (!user) {
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
            user = await db_1.default.user.create({
                data: {
                    name: parentData.name,
                    email: parentData.email,
                    password: hashedPassword,
                    role: 'PARENT',
                    isActive: true,
                    schoolId: tenantId,
                },
            });
        }
        // Ensure parent record belongs to tenant
        const existingParent = await db_1.default.parent.findUnique({
            where: { userId: user.id },
        });
        if (existingParent)
            return existingParent;
        return db_1.default.parent.create({
            data: {
                userId: user.id,
                name: parentData.name,
                email: parentData.email,
                phone: parentData.phone || '',
                schoolId: tenantId,
            },
        });
    },
    update: async (id, data) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!id)
            throw new Error('Student ID is required');
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.gender !== undefined)
            updateData.gender = data.gender;
        if (data.dateOfBirth !== undefined)
            updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
        if (data.address !== undefined)
            updateData.address = data.address;
        if (data.admissionNumber !== undefined)
            updateData.admissionNumber = data.admissionNumber;
        if (data.classId !== undefined)
            updateData.classId = data.classId;
        if (data.armId !== undefined)
            updateData.armId = data.armId;
        if (data.guardianRelationship !== undefined)
            updateData.guardianRelationship = data.guardianRelationship;
        if (data.isActive !== undefined)
            updateData.isActive = data.isActive;
        // Handle parentId – allow null, empty string, or valid ID
        if (data.parentId !== undefined) {
            if (data.parentId) {
                const parentExists = await db_1.default.parent.findFirst({
                    where: { id: data.parentId, schoolId: tenantId },
                });
                if (!parentExists)
                    throw new Error('Parent not found in this tenant');
            }
            updateData.parentId = data.parentId;
        }
        if (data.newParent) {
            const newParent = await exports.studentService.createParentWithUser(data.newParent);
            updateData.parentId = newParent.id;
        }
        const updatedStudent = await db_1.default.student.update({
            where: { id, schoolId: tenantId },
            data: updateData,
            include: { parent: true, class: true, arm: true },
        });
        // If the student's arm changed, re-sync subject enrolments to the new arm
        if (data.armId !== undefined) {
            await syncService_1.syncService.syncStudentSubjectsForStudent(tenantId, updatedStudent.id);
        }
        return updatedStudent;
    },
    assignParent: async (studentId, parentId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!studentId)
            throw new Error('Student ID is required');
        // Verify parent belongs to tenant
        const parentExists = await db_1.default.parent.findFirst({
            where: { id: parentId, schoolId: tenantId },
        });
        if (!parentExists)
            throw new Error('Parent not found in this tenant');
        return db_1.default.student.update({
            where: { id: studentId, schoolId: tenantId },
            data: { parentId },
            include: { parent: true },
        });
    },
    unassignParent: async (studentId) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        return db_1.default.student.update({
            where: { id: studentId, schoolId: tenantId },
            data: { parentId: null },
            include: { parent: true },
        });
    },
    delete: async (id) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!id)
            throw new Error('Student ID is required');
        await db_1.default.studentSubject.deleteMany({
            where: { studentId: id, schoolId: tenantId },
        });
        const student = await db_1.default.student.delete({
            where: { id, schoolId: tenantId },
        });
        // Remove the linked login account so the email can be reused on re-upload
        if (student.userId) {
            await db_1.default.user.deleteMany({ where: { id: student.userId, role: 'STUDENT' } });
        }
        return student;
    },
    // Bulk delete students (and their related records + login accounts) scoped to the tenant
    deleteMany: async (ids) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        if (!ids || ids.length === 0)
            throw new Error('No students selected');
        const students = await db_1.default.student.findMany({
            where: { id: { in: ids }, schoolId: tenantId },
            select: { id: true, userId: true },
        });
        const studentIds = students.map((s) => s.id);
        const userIds = students.map((s) => s.userId).filter(Boolean);
        await db_1.default.studentSubject.deleteMany({ where: { studentId: { in: studentIds }, schoolId: tenantId } });
        await db_1.default.attendance.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.studentPromotionHistory.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.result.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.feePayment.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.studentFee.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.testAttempt.deleteMany({ where: { studentId: { in: studentIds } } });
        await db_1.default.student.deleteMany({
            where: { id: { in: studentIds }, schoolId: tenantId },
        });
        // Remove linked login accounts so emails can be reused on re-upload
        if (userIds.length > 0) {
            await db_1.default.user.deleteMany({ where: { id: { in: userIds }, role: 'STUDENT' } });
        }
        return { deleted: studentIds.length };
    },
    // ---------- Additional methods ----------
    getAllParents: () => db_1.default.parent.findMany({
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: 'asc' },
    }), // middleware adds schoolId
    createParent: async (data) => {
        return exports.studentService.createParentWithUser(data);
    },
    getStudentSubjects: async (studentId) => {
        const links = await db_1.default.studentSubject.findMany({
            where: { studentId },
            include: { subject: true },
        }); // middleware adds schoolId
        return links.map(link => link.subject);
    },
    updateStudentSubjects: async (studentId, subjectIds) => {
        const tenantId = (0, tenantContext_1.getCurrentTenantId)();
        if (!tenantId)
            throw new Error('Tenant context missing');
        // Integrity: only allow subjects that exist in this school
        const schoolSubjectIds = new Set((await db_1.default.subject.findMany({ where: { schoolId: tenantId }, select: { id: true } })).map((s) => s.id));
        const invalid = subjectIds.filter((sid) => !schoolSubjectIds.has(sid));
        if (invalid.length)
            throw new Error('Some subjects do not belong to this school');
        await db_1.default.studentSubject.deleteMany({
            where: { studentId, schoolId: tenantId },
        });
        if (subjectIds.length > 0) {
            await db_1.default.studentSubject.createMany({
                data: subjectIds.map(subjectId => ({
                    studentId,
                    subjectId,
                    schoolId: tenantId,
                })),
            });
        }
        return exports.studentService.getStudentSubjects(studentId);
    },
    getStudentAttendance: (studentId) => db_1.default.attendance.findMany({
        where: { studentId },
        select: { date: true, present: true },
        orderBy: { date: 'desc' },
    }), // middleware adds schoolId
    getStudentFees: async (studentId) => {
        try {
            return [];
        }
        catch {
            return [];
        }
    },
    getStudentResults: async (studentId) => {
        const results = await db_1.default.result.findMany({
            where: { studentId },
            include: { subject: true, arm: { include: { class: true } }, academicYear: true },
            orderBy: [{ term: 'desc' }, { subject: { name: 'asc' } }],
        }); // middleware adds schoolId
        return results.map(result => ({
            subject: result.subject.name,
            score: result.score,
            grade: result.grade || '',
            term: result.term,
            arm: result.arm ? `${result.arm.class?.name ?? ''} ${result.arm.letter}`.trim() : '',
            academicYear: result.academicYear?.name || '',
            ca: result.ca,
            exam: result.exam,
            total: result.total,
        }));
    },
    // Full class/grade journey of the student, oldest first
    getStudentHistory: async (studentId) => {
        const [promotions, student] = await Promise.all([
            db_1.default.studentPromotionHistory.findMany({
                where: { studentId },
                include: {
                    fromArm: { include: { class: true } },
                    toArm: { include: { class: true } },
                    fromClass: true,
                    toClass: true,
                    academicYear: true,
                    term: true,
                },
                orderBy: { promotedAt: 'asc' },
            }),
            db_1.default.student.findUnique({
                where: { id: studentId },
                select: {
                    id: true, name: true, admissionNumber: true, createdAt: true,
                    arm: { include: { class: true } },
                },
            }),
        ]);
        if (!student)
            throw new Error('Student not found');
        // Build the chronological list of class placements from the promotion trail
        const placements = [];
        if (promotions.length > 0) {
            const first = promotions[0];
            placements.push({
                className: first.fromClass?.name || first.fromArm?.class?.name || '',
                arm: first.fromArm?.letter || '',
                academicYear: first.academicYear?.name || '',
                term: first.term?.name || '',
                promotedAt: first.promotedAt,
            });
            for (const p of promotions) {
                placements.push({
                    className: p.toClass?.name || p.toArm?.class?.name || '',
                    arm: p.toArm?.letter || '',
                    academicYear: p.academicYear?.name || '',
                    term: p.term?.name || '',
                    promotedAt: p.promotedAt,
                });
            }
        }
        else if (student.arm) {
            placements.push({
                className: student.arm.class?.name || '',
                arm: student.arm.letter,
                academicYear: '',
                term: '',
                promotedAt: student.createdAt,
            });
        }
        return { student: { id: student.id, name: student.name, admissionNumber: student.admissionNumber }, placements };
    },
    // Academic transcript across ALL classes/years the student has attended
    getStudentTranscript: async (studentId) => {
        const student = await db_1.default.student.findUnique({
            where: { id: studentId },
            select: {
                id: true, name: true, admissionNumber: true, gender: true,
                arm: { include: { class: true } },
            },
        });
        if (!student)
            throw new Error('Student not found');
        const results = await db_1.default.result.findMany({
            where: { studentId },
            include: { subject: true, arm: { include: { class: true } }, academicYear: true },
            orderBy: [{ academicYearId: 'asc' }, { term: 'asc' }, { subject: { name: 'asc' } }],
        });
        // Group results by class/level then academic year
        const grouped = {};
        for (const r of results) {
            const className = r.arm ? `${r.arm.class?.name ?? ''} ${r.arm.letter}`.trim() : 'Unknown';
            const year = r.academicYear?.name || 'Unknown';
            const key = `${className}|${year}`;
            if (!grouped[key])
                grouped[key] = { className, academicYear: year, entries: [], average: 0 };
            grouped[key].entries.push({
                subject: r.subject.name,
                ca: r.ca,
                exam: r.exam,
                total: r.total,
                score: r.score,
                grade: r.grade || '',
                term: r.term,
            });
        }
        const groups = Object.values(grouped).map(g => {
            g.average = g.entries.length
                ? Math.round((g.entries.reduce((s, e) => s + e.score, 0) / g.entries.length) * 100) / 100
                : 0;
            return g;
        });
        const overallAverage = results.length
            ? Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 100) / 100
            : 0;
        return {
            student: {
                id: student.id,
                name: student.name,
                admissionNumber: student.admissionNumber,
                gender: student.gender,
                currentClass: student.arm ? `${student.arm.class?.name ?? ''} ${student.arm.letter}`.trim() : '',
            },
            groups,
            overallAverage,
            totalSubjects: new Set(results.map(r => r.subjectId)).size,
        };
    },
};
