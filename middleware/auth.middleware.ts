import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
};

export const requireRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };

export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      req.user = { userId: payload.sub, role: payload.role };
    } catch {
      // silently ignore invalid token for optional auth
    }
  }
  next();
};
