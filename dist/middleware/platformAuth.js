"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePlatformRole = exports.platformAuth = void 0;
exports.signPlatformToken = signPlatformToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../config/prisma");
const PLATFORM_JWT_SECRET = () => process.env.JWT_SECRET; // same signing key; audience distinguishes realms
function signPlatformToken(user) {
    return jsonwebtoken_1.default.sign({
        sub: user.id,
        realm: "platform",
        role: user.role,
        name: user.name,
        email: user.email,
    }, PLATFORM_JWT_SECRET(), { expiresIn: "12h" });
}
const platformAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, PLATFORM_JWT_SECRET());
        if (decoded.realm !== "platform" || !decoded.sub) {
            return res
                .status(403)
                .json({ error: "Forbidden — platform credentials required" });
        }
        const user = await prisma_1.prisma.platformUser.findUnique({
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
    }
    catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};
exports.platformAuth = platformAuth;
const requirePlatformRole = (...roles) => {
    return (req, res, next) => {
        if (!req.platformUser)
            return res.status(401).json({ error: "Unauthorized" });
        if (req.platformUser.role === "SUPER_ADMIN")
            return next();
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
exports.requirePlatformRole = requirePlatformRole;
