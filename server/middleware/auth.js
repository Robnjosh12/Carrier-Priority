/**
 * CARRIER PRIORITY — Auth Middleware
 * ====================================
 * Validates JWT access tokens. Attaches req.user = { sub, company, role }.
 * All routes require this except: POST /api/auth/login, POST /api/auth/register, GET /health.
 */

import { AuthService } from "../services/index.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing bearer token", code: 401 });
  }

  try {
    const payload = AuthService.verifyAccess(token);
    req.user = payload; // { sub: userId, company: carrierId, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid or expired token", code: 401 });
  }
}

/**
 * Restrict a route to specific roles, e.g. requireRole("owner", "dispatcher").
 * Must run after requireAuth.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthenticated", code: 401 });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Insufficient permissions", code: 403 });
    }
    next();
  };
}

/**
 * Basic per-user audit logger. In production this writes to a dedicated
 * audit_log table or log pipeline; here it's console-based and safe to
 * swap out without touching route logic.
 */
export function auditLog(action) {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode < 400) {
        console.log(
          `[audit] user=${req.user?.sub || "anon"} action=${action} ip=${req.ip} status=${res.statusCode} ${req.method} ${req.originalUrl}`
        );
      }
    });
    next();
  };
}
