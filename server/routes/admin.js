import { Router } from 'express';
import { getAllLeads, getContactState, getActiveInstances } from '../db.js';
import { leadsToCsv } from '../util/csv.js';
import { authenticateToken } from '../middleware.js';

const router = Router();

// GET /api/admin/leads.csv  (auth via Bearer or ?token=)
router.get('/leads.csv', authenticateToken, async (req, res) => {
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

// GET /api/admin/contact-state?email=...  (debug / e2e only)
router.get('/contact-state', authenticateToken, async (req, res) => {
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
