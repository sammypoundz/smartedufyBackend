// Central privilege catalog (server-side source of truth).
// Mirrors frontend/src/utils/privileges.ts — keep both in sync.

export interface PagePrivilege {
  key: string;
  label: string;
  group: string;
}

// Every guardable page in the system. `key` values are stored on
// RoleDef.privileges and User.allowedPages.
export const ALL_PRIVILEGES: PagePrivilege[] = [
  // Academic
  { key: "classes", label: "Classes", group: "Academic" },
  { key: "subjects", label: "Subjects", group: "Academic" },
  { key: "students", label: "Students", group: "Academic" },
  { key: "results", label: "Results", group: "Academic" },
  { key: "reports", label: "Reports", group: "Academic" },
  { key: "broadsheet", label: "Broadsheet", group: "Academic" },
  { key: "assessment-format", label: "Assessment Format", group: "Academic" },
  { key: "lesson-plan", label: "Lesson Plan", group: "Academic" },
  { key: "timetable", label: "Timetable", group: "Academic" },
  { key: "cbt", label: "CBT", group: "Academic" },
  { key: "question-review", label: "Question Review", group: "Academic" },
  { key: "academic", label: "Academic Sessions", group: "Academic" },
  // Finance
  { key: "fees", label: "Fees", group: "Finance" },
  { key: "expenses", label: "Expenses", group: "Finance" },
  { key: "payroll", label: "Payroll", group: "Finance" },
  // People / HR
  { key: "staff", label: "Staff", group: "People" },
  { key: "teachers", label: "Teachers", group: "People" },
  { key: "parents", label: "Parents", group: "People" },
  { key: "messaging", label: "Messaging", group: "People" },
  // Administration
  { key: "users", label: "User Management", group: "Administration" },
  { key: "roles", label: "Roles & Privileges", group: "Administration" },
  { key: "inventory", label: "Inventory", group: "Administration" },
  { key: "settings", label: "Settings", group: "Administration" },
  { key: "audit-logs", label: "Audit Logs", group: "Administration" },
];

// Default privilege sets attached to system roles. Any user holding the
// role inherits these; admins can still grant extra privileges per user
// or build custom roles.
export const SYSTEM_ROLE_PRIVILEGES: Record<string, string[]> = {
  ADMIN: ALL_PRIVILEGES.map((p) => p.key),
  PRINCIPAL: ALL_PRIVILEGES.map((p) => p.key),
  VICE_PRINCIPAL: [
    "classes",
    "subjects",
    "students",
    "results",
    "reports",
    "broadsheet",
    "assessment-format",
    "lesson-plan",
    "timetable",
    "cbt",
    "academic",
    "staff",
    "teachers",
    "messaging",
  ],
  TEACHER: [
    "classes",
    "subjects",
    "students",
    "results",
    "reports",
    "broadsheet",
    "assessment-format",
    "lesson-plan",
    "timetable",
    "cbt",
  ],
  BURSAR: ["fees", "expenses", "reports", "inventory"],
  ACCOUNTANT: ["fees", "expenses", "reports", "payroll"],
  LIBRARIAN: ["inventory", "students"],
};

export const DEFAULT_ROLES: {
  name: string;
  label: string;
  isSystem: boolean;
}[] = [
  { name: "ADMIN", label: "Admin", isSystem: true },
  { name: "PRINCIPAL", label: "Principal", isSystem: true },
  { name: "VICE_PRINCIPAL", label: "Vice Principal", isSystem: true },
  { name: "TEACHER", label: "Teacher", isSystem: true },
  { name: "BURSAR", label: "Bursar", isSystem: true },
  { name: "ACCOUNTANT", label: "Accountant", isSystem: true },
  { name: "LIBRARIAN", label: "Librarian", isSystem: true },
  { name: "PARENT", label: "Parent", isSystem: true },
  { name: "STUDENT", label: "Student", isSystem: true },
];
