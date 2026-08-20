import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Directories
const lessonPlanDir = 'uploads/lesson-plans';
const questionDir = 'uploads/questions';

// Ensure both directories exist
[lessonPlanDir, questionDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ---------- Lesson Plan Storage & Filter ----------
const lessonPlanStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, lessonPlanDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const lessonPlanFilter = (req: any, file: any, cb: any) => {
  const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX allowed.'));
};

// ---------- Question Attachment Storage & Filter ----------
const questionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, questionDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'q-' + unique + ext);
  },
});

const questionFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and audio files allowed.'));
  }
};

// ---------- Export both multer instances ----------
export const uploadLessonPlan = multer({
  storage: lessonPlanStorage,
  fileFilter: lessonPlanFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadQuestion = multer({
  storage: questionStorage,
  fileFilter: questionFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// For backward compatibility (if your existing lesson‑plan routes use `upload`),
// keep the default export pointing to the lesson plan uploader.
export const upload = uploadLessonPlan;