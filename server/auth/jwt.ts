import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET or SESSION_SECRET environment variable is required in production');
    }
    console.warn('[JWT] Warning: JWT_SECRET not set, using generated secret. Tokens will be invalidated on restart.');
    return crypto.randomBytes(64).toString("hex");
  }
  if (!process.env.JWT_SECRET && process.env.SESSION_SECRET) {
    console.log('[JWT] Using SESSION_SECRET for JWT signing');
  }
  return secret;
}

function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_REFRESH_SECRET or SESSION_SECRET environment variable is required in production');
    }
    console.warn('[JWT] Warning: JWT_REFRESH_SECRET not set, using generated secret.');
    return crypto.randomBytes(64).toString("hex");
  }
  if (!process.env.JWT_REFRESH_SECRET && process.env.SESSION_SECRET) {
    console.log('[JWT] Using SESSION_SECRET for JWT refresh token signing');
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_REFRESH_SECRET = getJwtRefreshSecret();

const ACCESS_TOKEN_EXPIRY = "24h";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  userId?: string;
}

export function generateAccessToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiry;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

export function jwtAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) {
    req.userId = sessionUserId;
    return next();
  }

  if ((req as any).user) {
    req.userId = (req as any).user.id;
    return next();
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  req.userId = payload.userId;
  next();
}

export function optionalJwtAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) {
    req.userId = sessionUserId;
    return next();
  }

  if ((req as any).user) {
    req.userId = (req as any).user.id;
    return next();
  }

  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = payload;
      req.userId = payload.userId;
    }
  }
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch {
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

export async function createRefreshTokenForUser(
  userId: string,
  ipAddress?: string | null,
  deviceInfo?: string | null
): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  await storage.createRefreshToken({
    userId,
    token,
    expiresAt,
    isRevoked: false,
    ipAddress: ipAddress || null,
    deviceInfo: deviceInfo || null,
  });

  return token;
}

export async function validateRefreshToken(token: string): Promise<string | null> {
  const refreshToken = await storage.getRefreshTokenByToken(token);
  
  if (!refreshToken) {
    return null;
  }

  if (refreshToken.isRevoked) {
    return null;
  }

  if (new Date() > new Date(refreshToken.expiresAt)) {
    await storage.revokeRefreshToken(refreshToken.id);
    return null;
  }

  return refreshToken.userId;
}

export async function revokeUserRefreshTokens(userId: string): Promise<void> {
  await storage.revokeAllUserRefreshTokens(userId);
}

export async function revokeRefreshToken(token: string): Promise<boolean> {
  const refreshToken = await storage.getRefreshTokenByToken(token);
  if (!refreshToken) {
    return false;
  }
  await storage.revokeRefreshToken(refreshToken.id);
  return true;
}

export async function cleanupExpiredTokens(): Promise<void> {
  await storage.deleteExpiredRefreshTokens();
}
