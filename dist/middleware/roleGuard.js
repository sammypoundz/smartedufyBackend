"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleGuard = void 0;
const roleGuard = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Convert both to lowercase for case‑insensitive comparison
        const userRole = req.user.role.toLowerCase();
        const hasRole = allowedRoles.some(role => role.toLowerCase() === userRole);
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
