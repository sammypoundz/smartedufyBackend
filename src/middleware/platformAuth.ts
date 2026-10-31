// Platform-level guard middleware for the Super Admin console.
// Routes mounted behind `requirePlatformAuth` accept a JWT whose subject is a
// PlatformUser id (role: SUPER_ADMIN, FINANCE_ADMIN, ONBOARDING_OFFICER,
// SUPPORT_OFFICER, ANALYTICS_VIEWER). This is a SEPARATE auth realm from the
// school-tenant JWTs — a school admin can never impersonate a platform user.
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";

export interface PlatformAuthRequest extends Request {
  platformUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

const PLATFORM_JWT_SECRET = () => process.env.JWT_SECRET!; // same signing key; audience distinguishes realms

export function signPlatformToken(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}) {
  return jwt.sign(
    {
      sub: user.id,
      realm: "platform",
      role: user.role,
      name: user.name,
      email: user.email,
    },
    PLATFORM_JWT_SECRET(),
    { expiresIn: "12h" },
  );
}

export const platformAuth = async (
  req: PlatformAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, PLATFORM_JWT_SECRET()) as any;
    if (decoded.realm !== "platform" || !decoded.sub) {
      return res
        .status(403)
        .json({ error: "Forbidden — platform credentials required" });
    }
    const user = await prisma.platformUser.findUnique({
      where: { id: decoded.sub },
    });
    if (!user || !user.isActive)
      return res.status(403).json({ error: "Account disabled" });
    req.platformUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

export const requirePlatformRole = (...roles: string[]) => {
  return (req: PlatformAuthRequest, res: Response, next: NextFunction) => {
    if (!req.platformUser)
      return res.status(401).json({ error: "Unauthorized" });
    if (req.platformUser.role === "SUPER_ADMIN") return next();
    if (!roles.includes(req.platformUser.role)) {
      return res
        .status(403)
        .json({
          error: "Forbidden",
          message: `Required roles: ${roles.join(", ")}`,
        });
    }
    next();
  };
};
