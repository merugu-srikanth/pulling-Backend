import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AdminUserModel } from "../models/auth.model";

const JWT_SECRET = process.env.JWT_SECRET || "gov-vacancy-scraper-jwt-secret-key-12345";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    const user = await AdminUserModel.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ error: "Invalid token or user does not exist." });
    }

    (req as any).user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "Access denied. Super Admin role required." });
  }
  next();
}

export function requirePermission(permission: "scraping" | "task_manager") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    
    // Super admin can access everything
    if (user.role === "super_admin") {
      return next();
    }

    if (user.permissions && user.permissions[permission] === true) {
      return next();
    }

    return res.status(403).json({ error: `Access denied. Requires '${permission}' permission.` });
  };
}
