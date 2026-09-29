import { Router } from 'express';
import { getAllLeads, getContactState, getActiveInstances } from '../db.js';
import { leadsToCsv } from '../util/csv.js';

const router = Router();

function adminAuth(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(503).json({ ok: false, error: 'admin_disabled' });
  const provided = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7)
    : req.query.token;
  if (provided !== token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  next();
}

// GET /api/admin/leads.csv?token=ADMIN_TOKEN
router.get('/leads.csv', async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.query.token !== token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const rows = await getAllLeads();
    const csv = leadsToCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[admin] error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/admin/contact-state?email=...&token=ADMIN_TOKEN  (debug / e2e only)
router.get('/contact-state', adminAuth, async (req, res) => {
  const email = (req.query.email || '').toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'missing_email' });
  try {
    const state = await getContactState(email);
    const active = await getActiveInstances(email);
    res.json({
      ok: true,
      state: state || null,
      active_automations: active.map((a) => a.automation_key),
    });
  } catch (err) {
    console.error('[admin] contact-state error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
