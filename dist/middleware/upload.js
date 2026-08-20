"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = exports.uploadQuestion = exports.uploadLessonPlan = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Directories
const lessonPlanDir = 'uploads/lesson-plans';
const questionDir = 'uploads/questions';
// Ensure both directories exist
[lessonPlanDir, questionDir].forEach(dir => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
// ---------- Lesson Plan Storage & Filter ----------
const lessonPlanStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, lessonPlanDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, unique + ext);
    },
});
const lessonPlanFilter = (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext))
        cb(null, true);
    else
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX allowed.'));
};
// ---------- Question Attachment Storage & Filter ----------
const questionStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, questionDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'q-' + unique + ext);
    },
});
const questionFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif',
        'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/wav'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only images, videos, and audio files allowed.'));
    }
};
// ---------- Export both multer instances ----------
exports.uploadLessonPlan = (0, multer_1.default)({
    storage: lessonPlanStorage,
    fileFilter: lessonPlanFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
exports.uploadQuestion = (0, multer_1.default)({
    storage: questionStorage,
    fileFilter: questionFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
// For backward compatibility (if your existing lesson‑plan routes use `upload`),
// keep the default export pointing to the lesson plan uploader.
exports.upload = exports.uploadLessonPlan;
