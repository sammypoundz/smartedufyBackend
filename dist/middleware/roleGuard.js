"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.privilegeGuard = exports.roleGuard = void 0;
// Kept for backward compatibility – roleGuard now lives in auth.ts and
// supports multi-role users + privilege-based guards.
var auth_1 = require("./auth");
Object.defineProperty(exports, "roleGuard", { enumerable: true, get: function () { return auth_1.roleGuard; } });
Object.defineProperty(exports, "privilegeGuard", { enumerable: true, get: function () { return auth_1.privilegeGuard; } });
