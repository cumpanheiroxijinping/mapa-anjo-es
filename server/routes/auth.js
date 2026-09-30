// POST /api/admin/login, profile, and user management (ESM port of ZAPSPY's
// admin-auth.js). Issues a JWT. Falls back to ADMIN_EMAIL/ADMIN_PASSWORD env
// credentials for the master admin (backward compatible with ADMIN_TOKEN).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, apiLimiter } from '../middleware.js';
import {
  findAdminUserByIdentifier, getAdminUserById, listAdminUsers,
  createAdminUser, updateAdminUser, deleteAdminUser, getPool,
} from '../db.js';

const router = Router();

// ---------------- Login
router.post('/login', apiLimiter, async (req, res) => {
  try {
    const { email, password, username } = req.body || {};
    const loginIdentifier = email || username;
    if (!loginIdentifier || !password) {
      return res.status(400).json({ ok: false, error: 'email_and_password_required' });
    }
    // JWT login requires JWT_SECRET; master env creds require ADMIN_EMAIL/PASSWORD.
    if (!process.env.JWT_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      return res.status(503).json({ ok: false, error: 'auth_unavailable' });
    }

    let user = null;
    let validPassword = false;

    // Master admin from env (no DB row needed).
    const envEmail = process.env.ADMIN_EMAIL;
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envEmail && envPassword && loginIdentifier.toLowerCase() === envEmail.toLowerCase()) {
      if (password === envPassword) {
        validPassword = true;
        user = { id: 0, email: envEmail, username: 'admin', role: 'admin', name: 'Administrador' };
      }
    }

    // Otherwise look up a DB user.
    if (!validPassword) {
      const dbUser = await findAdminUserByIdentifier(loginIdentifier);
      if (dbUser) {
        validPassword = await bcrypt.compare(password, dbUser.password_hash);
        if (validPassword) {
          user = dbUser;
          await getPool().query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [dbUser.id]).catch(() => {});
        }
      }
    }

    if (!validPassword || !user) {
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, username: user.username, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('[auth] login error', err);
    res.status(500).json({ ok: false, error: 'login_failed' });
  }
});

// ---------------- Current profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.legacy || req.user.id === 0) {
      return res.json({ ok: true, user: { id: 0, username: 'admin', email: req.user.email, name: 'Administrador', role: 'admin' } });
    }
    const dbUser = await getAdminUserById(req.user.userId);
    if (!dbUser) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({
      ok: true,
      user: { id: dbUser.id, username: dbUser.username, email: dbUser.email, name: dbUser.name, role: dbUser.role, last_login: dbUser.last_login },
    });
  } catch (err) {
    console.error('[auth] profile error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ---------------- User management (admin only)
router.get('/users', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const users = await listAdminUsers();
    res.json({ ok: true, users });
  } catch (err) {
    console.error('[auth] list users error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.post('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { username, email, password, name, role } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, error: 'username_email_password_required' });
    }
    const allowedRoles = ['admin', 'support', 'viewer'];
    const userRole = allowedRoles.includes(role) ? role : 'support';
    const hashed = await bcrypt.hash(password, 10);
    const user = await createAdminUser({
      username, email: email.toLowerCase(), passwordHash: hashed, name, role: userRole, createdBy: req.user.userId,
    });
    res.json({ ok: true, user });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ ok: false, error: 'user_exists' });
    }
    console.error('[auth] create user error', err);
    res.status(500).json({ ok: false, error: 'create_failed' });
  }
});

router.put('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role, is_active, password } = req.body || {};
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (email !== undefined && email.trim()) patch.email = email.trim().toLowerCase();
    if (role !== undefined) patch.role = role;
    if (is_active !== undefined) patch.is_active = is_active;
    if (password) {
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'password_too_short' });
      patch.password_hash = await bcrypt.hash(password, 10);
    }
    const user = await updateAdminUser(id, patch);
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, user });
  } catch (err) {
    console.error('[auth] update user error', err);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.id === id) return res.status(403).json({ ok: false, error: 'cannot_delete_self' });
    const user = await deleteAdminUser(id);
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, message: 'deleted' });
  } catch (err) {
    console.error('[auth] delete user error', err);
    res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

export default router;
