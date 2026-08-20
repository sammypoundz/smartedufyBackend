import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Import routes
import authRoutes from './routes/auth';
import classRoutes from './routes/classes';
import armRoutes from './routes/arms';
import subjectRoutes from './routes/subjects';
import skillRoutes from './routes/skills';
import attendanceRoutes from './routes/attendance';
import timetableRoutes from './routes/timetable';
import studentRoutes from './routes/students';
import parentRoutes from './routes/parents';
import resultRoutes from './routes/results';
import teacherRoutes from './routes/teachers';
import userRoutes from './routes/users';
import lessonPlanRoutes from './routes/lessonPlanRoutes';
import assessmentFormatRoutes from './routes/assessmentFormatRoutes';
import academicRoutes from './routes/academicRoutes';
import promotionRoutes from './routes/promotionRoutes';
import testRoutes from './routes/testRoutes';
import questionRoutes from './routes/questionRoutes';
import testAttemptRoutes from './routes/testAttemptRoutes';
import feeRoutes from './routes/feeRoutes';
import expenseRoutes from './routes/expenseRoutes';
import budgetRoutes from './routes/budgetRoutes';
import payrollRoutes from './routes/payrollRoutes';
import staffRoutes from './routes/staff';
import messageRoutes from './routes/messageRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import settingsRoutes from './routes/settingsRoutes';


// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration (development)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ---------- Public routes (no authentication required) ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'SmartEdufy API is running' });
});
app.use('/api/auth', authRoutes); // login, register, etc.

// ---------- Global authentication & tenant middleware ----------
app.use(authMiddleware);      // sets req.user
app.use(tenantMiddleware);    // sets tenant context & validates user belongs to tenant

// ---------- Protected routes (require authentication & tenant) ----------
app.use('/api/classes', classRoutes);
app.use('/api/arms', armRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/assessment-formats', assessmentFormatRoutes);
app.use('/api', academicRoutes);
app.use('/api', promotionRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/test-attempts', testAttemptRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/settings', settingsRoutes)

// Error handler
app.use(errorHandler);

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`CORS enabled for all origins`);
  console.log(`📁 Static files served from /uploads`);
});