import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export interface PartnerScopedRequest extends Request {
  userId?: string;
  userRole?: string;
  partnerId?: string | null;
}

export async function partnerScopeMiddleware(req: PartnerScopedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return next();
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return next();
    }
    
    req.userRole = user.role;
    req.partnerId = user.partnerId || null;
    
    next();
  } catch (error) {
    console.error("Partner scope middleware error:", error);
    next();
  }
}

export function requirePartnerScope(req: PartnerScopedRequest, res: Response, next: NextFunction) {
  const userRole = req.userRole;
  
  if (userRole === "admin" || userRole === "finance_admin") {
    return next();
  }
  
  if (userRole === "partner_admin" && !req.partnerId) {
    return res.status(403).json({ error: "Partner admin not assigned to any partner" });
  }
  
  next();
}

export function isAdmin(req: PartnerScopedRequest): boolean {
  return req.userRole === "admin";
}

export function isPartnerAdmin(req: PartnerScopedRequest): boolean {
  return req.userRole === "partner_admin";
}

export function canAccessPartnerData(req: PartnerScopedRequest, targetPartnerId: string | null): boolean {
  if (req.userRole === "admin" || req.userRole === "finance_admin") {
    return true;
  }
  
  if (req.userRole === "partner_admin") {
    return req.partnerId === targetPartnerId;
  }
  
  return false;
}

export function getPartnerFilter(req: PartnerScopedRequest): string | null | undefined {
  if (req.userRole === "admin" || req.userRole === "finance_admin") {
    return undefined;
  }
  
  if (req.userRole === "partner_admin") {
    return req.partnerId;
  }
  
  return undefined;
}
