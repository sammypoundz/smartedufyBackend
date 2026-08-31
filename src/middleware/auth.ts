// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  role: string;              // primary role (legacy single-role field)
  roles?: string[];          // all roles held by the user
  privileges?: string[];     // effective privileges (union of role privileges + direct grants)
  schoolId: string;
  isActive?: boolean;
  name?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role guard – accepts multiple roles. Passes if the user holds ANY of them.
export const roleGuard = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
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

// Privilege guard – passes if the user holds ANY of the given privileges
// OR has the ADMIN/PRINCIPAL role (implicit full access).
export const privilegeGuard = (...privileges: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const roles = [req.user.role, ...(req.user.roles || [])].filter(Boolean);
    if (roles.includes('ADMIN') || roles.includes('PRINCIPAL')) return next();
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