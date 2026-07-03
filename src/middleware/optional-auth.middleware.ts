/**
 * Like authMiddleware but soft — never 401s.
 *
 * Use on endpoints that work for both anonymous and authenticated
 * callers, where the response shape differs based on identity.
 *
 *   - No Authorization header   -> req.userId stays undefined; continue
 *   - Bearer token, valid JWT   -> req.userId set; continue
 *   - Bearer token, invalid JWT -> req.userId stays undefined; continue
 *
 * The handler decides how to react to a missing userId. Use the strict
 * authMiddleware on endpoints that REQUIRE a logged-in user.
 */

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
  sub?: string;
  userId?: string;
  email?: string;
}

export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.header("Authorization");
  if (!authHeader) return next();

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return next();

  const secret = process.env.JWT_SECRET;
  if (!secret) return next();

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload | string;
    if (typeof decoded === "string") return next();

    const userId = decoded.sub ?? decoded.userId;
    if (userId) req.userId = userId;
  } catch {
    // Invalid/expired token on an optional-auth route is fine —
    // treat the caller as anonymous and move on. We don't log noise
    // here; bad tokens are common (stale, tampered, expired).
  }

  return next();
}
