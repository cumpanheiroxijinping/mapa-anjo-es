// Authentication middleware + role guard (ESM port of ZAPSPY's middleware.js).
//
// authenticateToken accepts EITHER a JWT issued by /api/admin/login OR the
// legacy ADMIN_TOKEN bearer/query token. This lets the existing dashboard keep
// working with ADMIN_TOKEN while new JWT logins are also accepted.
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

// JWT auth (issued by /api/admin/login) OR legacy ADMIN_TOKEN fallback.
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const provided = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.token;

  if (!provided) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  // Legacy master token: accept as admin role (backward compatible).
  const legacy = process.env.ADMIN_TOKEN;
  if (legacy && provided === legacy) {
    req.user = { id: 0, email: process.env.ADMIN_EMAIL || 'admin', role: 'admin', legacy: true };
    return next();
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: 'auth_unavailable' });
  }

  jwt.verify(provided, secret, (err, user) => {
    if (err) return res.status(401).json({ ok: false, error: 'invalid_token' });
    req.user = user;
    next();
  });
}

// Role guard — only lets listed roles through.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    next();
  };
}

// Rate limiter for auth endpoints (login brute-force protection).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' },
});

// Broad admin limiter (read/write dashboards).
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' },
});

export default { authenticateToken, requireRole, apiLimiter, adminLimiter };
