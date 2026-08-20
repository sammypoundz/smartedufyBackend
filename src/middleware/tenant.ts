// src/middleware/tenant.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { runWithTenant } from '../utils/tenantContext';
import { AuthRequest } from './auth'; // 👈 import the extended request type

// Extend Express Request to include tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        subdomain: string | null;
        isActive: boolean;
      };
    }
  }
}

export const tenantMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID (X-Tenant-ID header) is required' });
  }

  try {
    // Verify tenant exists
    const school = await prisma.school.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, subdomain: true, isActive: true },
    });

    if (!school) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // ✅ Check that the authenticated user belongs to this tenant
    if (req.user) {
      if (req.user.schoolId !== tenantId) {
        return res.status(403).json({ error: 'User does not belong to this tenant' });
      }
    } else {
      // If authMiddleware is not run before this, we may want to allow or reject.
      // Typically, tenantMiddleware runs after authMiddleware, so req.user should exist.
      // But to be safe, we can allow requests without a user (e.g., public routes) or reject.
      // For now, we'll allow it and let the auth check handle it later.
      // You can uncomment the next line to enforce authentication at tenant level:
      return res.status(401).json({ error: 'Authentication required' });
    }

    req.tenant = school;

    // Run the rest of the request inside the tenant context
    await runWithTenant(tenantId, async () => {
      next();
    });
  } catch (error) {
    console.error('Tenant middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};