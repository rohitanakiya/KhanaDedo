import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface JwtPayload {
  sub?: string;
  userId?: string;
  email?: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Invalid authorization format" });
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload | string;

    if (typeof decoded === "string") {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // auth.service signs with `sub`; some older tokens may have used
    // `userId`. Accept either so existing sessions keep working.
    const userId = decoded.sub ?? decoded.userId;
    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.userId = userId;
    next();
  } catch (err) {
    console.error("JWT ERROR:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
