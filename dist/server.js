"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const classes_1 = __importDefault(require("./routes/classes"));
const arms_1 = __importDefault(require("./routes/arms"));
const subjects_1 = __importDefault(require("./routes/subjects"));
const skills_1 = __importDefault(require("./routes/skills"));
const attendance_1 = __importDefault(require("./routes/attendance"));
const timetable_1 = __importDefault(require("./routes/timetable"));
const students_1 = __importDefault(require("./routes/students"));
const parents_1 = __importDefault(require("./routes/parents"));
const results_1 = __importDefault(require("./routes/results"));
const teachers_1 = __importDefault(require("./routes/teachers"));
const teacherRegistrationRoutes_1 = __importDefault(require("./routes/teacherRegistrationRoutes"));
const users_1 = __importDefault(require("./routes/users"));
const roles_1 = __importDefault(require("./routes/roles"));
const lessonPlanRoutes_1 = __importDefault(require("./routes/lessonPlanRoutes"));
const assessmentFormatRoutes_1 = __importDefault(require("./routes/assessmentFormatRoutes"));
const academicRoutes_1 = __importDefault(require("./routes/academicRoutes"));
const promotionRoutes_1 = __importDefault(require("./routes/promotionRoutes"));
const testRoutes_1 = __importDefault(require("./routes/testRoutes"));
const questionRoutes_1 = __importDefault(require("./routes/questionRoutes"));
const testAttemptRoutes_1 = __importDefault(require("./routes/testAttemptRoutes"));
const feeRoutes_1 = __importDefault(require("./routes/feeRoutes"));
const expenseRoutes_1 = __importDefault(require("./routes/expenseRoutes"));
const budgetRoutes_1 = __importDefault(require("./routes/budgetRoutes"));
const payrollRoutes_1 = __importDefault(require("./routes/payrollRoutes"));
const staff_1 = __importDefault(require("./routes/staff"));
const messageRoutes_1 = __importDefault(require("./routes/messageRoutes"));
const inventoryRoutes_1 = __importDefault(require("./routes/inventoryRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const auditLogs_1 = __importDefault(require("./routes/auditLogs"));
const questionDocRoutes_1 = __importDefault(require("./routes/questionDocRoutes"));
// Import middleware
const errorHandler_1 = require("./middleware/errorHandler");
const auth_2 = require("./middleware/auth");
const tenant_1 = require("./middleware/tenant");
const audit_1 = require("./middleware/audit");
const db_1 = __importDefault(require("./config/db"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
// CORS configuration (development)
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));
// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use(express_1.default.json());
// Serve uploaded files
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// ---------- Public routes (no authentication required) ----------
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'SmartEdufy API is running' });
});
app.use('/api/auth', auth_1.default); // login, register, etc.
// ---------- Global authentication & tenant middleware ----------
app.use(auth_2.authMiddleware); // sets req.user
app.use(tenant_1.tenantMiddleware); // sets tenant context & validates user belongs to tenant
app.use(audit_1.auditMiddleware); // logs every mutating request
// ---------- Protected routes (require authentication & tenant) ----------
app.use('/api/classes', classes_1.default);
app.use('/api/arms', arms_1.default);
app.use('/api/subjects', subjects_1.default);
app.use('/api/skills', skills_1.default);
app.use('/api/attendance', attendance_1.default);
app.use('/api/timetable', timetable_1.default);
app.use('/api/students', students_1.default);
app.use('/api/parents', parents_1.default);
app.use('/api/results', results_1.default);
app.use('/api/teachers', teachers_1.default);
app.use('/api/teacher-registrations', teacherRegistrationRoutes_1.default);
app.use('/api/users', users_1.default);
app.use('/api/roles', roles_1.default);
app.use('/api/lesson-plans', lessonPlanRoutes_1.default);
app.use('/api/assessment-formats', assessmentFormatRoutes_1.default);
app.use('/api', academicRoutes_1.default);
app.use('/api', promotionRoutes_1.default);
app.use('/api/tests', testRoutes_1.default);
app.use('/api/questions', questionRoutes_1.default);
app.use('/api/test-attempts', testAttemptRoutes_1.default);
app.use('/api/fees', feeRoutes_1.default);
app.use('/api/expenses', expenseRoutes_1.default);
app.use('/api/budgets', budgetRoutes_1.default);
app.use('/api/payroll', payrollRoutes_1.default);
app.use('/api/staff', staff_1.default);
app.use('/api/messages', messageRoutes_1.default);
app.use('/api/inventory', inventoryRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api/audit-logs', auditLogs_1.default);
app.use('/api/question-docs', questionDocRoutes_1.default);
const timetableWorkflowRoutes_1 = __importDefault(require("./routes/timetableWorkflowRoutes"));
const parentLinkRoutes_1 = __importDefault(require("./routes/parentLinkRoutes"));
app.use('/api/timetable-workflow', timetableWorkflowRoutes_1.default);
app.use('/api/parent-links', parentLinkRoutes_1.default);
// Error handler
app.use(errorHandler_1.errorHandler);
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`CORS enabled for all origins`);
    console.log(`📁 Static files served from /uploads`);
    // One-time backfill: rows created before the createdAt field existed (e.g.
    // from the seed or imports) would otherwise break queries that order by it.
    // Raw collection update avoids the Prisma client's non-nullable DateTime.
    setTimeout(async () => {
        const backfill = async (model) => {
            try {
                const res = await db_1.default.$runCommandRaw({
                    update: model,
                    updates: [
                        {
                            // $runCommandRaw serialises arguments as JSON, so a JS Date would
                            // be stored as a string — which Prisma can't read back. $currentDate
                            // is evaluated by Mongo itself and stores a proper BSON date.
                            q: {
                                $or: [
                                    { createdAt: { $exists: false } },
                                    { createdAt: null },
                                    { createdAt: { $type: "string" } },
                                ],
                            },
                            u: { $currentDate: { createdAt: true } },
                            multi: true,
                        },
                    ],
                });
                const modified = res?.nModified ?? res?.modifiedCount ?? 0;
                if (modified > 0)
                    console.log(`🛠  Backfilled createdAt on ${modified} ${model} docs`);
            }
            catch (e) {
                console.warn(`createdAt backfill skipped for ${model}:`, e.message);
            }
        };
        await backfill('Teacher');
        await backfill('User');
    }, 3000);
});
