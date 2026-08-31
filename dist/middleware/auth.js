"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.privilegeGuard = exports.roleGuard = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authMiddleware = authMiddleware;
// Role guard – accepts multiple roles. Passes if the user holds ANY of them.
const roleGuard = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userRoles = [req.user.role, ...(req.user.roles || [])]
            .filter(Boolean)
            .map(r => r.toLowerCase());
        const hasRole = allowedRoles.some(role => userRoles.includes(role.toLowerCase()));
        if (!hasRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Required roles: ${allowedRoles.join(', ')}`,
            });
        }
        next();
    };
};
exports.roleGuard = roleGuard;
// Privilege guard – passes if the user holds ANY of the given privileges
// OR has the ADMIN/PRINCIPAL role (implicit full access).
const privilegeGuard = (...privileges) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const roles = [req.user.role, ...(req.user.roles || [])].filter(Boolean);
        if (roles.includes('ADMIN') || roles.includes('PRINCIPAL'))
            return next();
        const userPrivileges = req.user.privileges || [];
        const hasPrivilege = privileges.some(p => userPrivileges.includes(p));
        if (!hasPrivilege) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Required privileges: ${privileges.join(', ')}`,
            });
        }
        next();
    };
};
exports.privilegeGuard = privilegeGuard;
