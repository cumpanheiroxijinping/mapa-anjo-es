// GET /api/admin/leads (filtered + paginated) and /:email (cross-reference detail).
// The "Leads" tab lists the funnel-captured leads table (`leads`), which is where
// real quiz/email captures live — not `contact_states` (payment/automation state).
import { Router } from 'express';
import { authenticateToken, adminLimiter } from '../middleware.js';
import {
  listLeads, getContactState, getActiveInstances, listFunnelEvents,
  listPostbackLogs, getPool,
} from '../db.js';

const router = Router();

router.use(authenticateToken);
router.use(adminLimiter);

// GET /api/admin/leads?search=&zodiac_sign=&life_challenge=&gender=&utm_source=&source=&includeTest=1&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const q = req.query;
    const limit = Math.min(Number(q.limit) || 50, 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const { rows, total } = await listLeads({
      search: q.search || undefined,
      zodiac_sign: q.zodiac_sign || undefined,
      life_challenge: q.life_challenge || undefined,
      gender: q.gender || undefined,
      utm_source: q.utm_source || undefined,
      source: q.source || undefined,
      excludeTest: !q.includeTest,
      limit, offset,
    });
    res.json({ ok: true, total, limit, offset, leads: rows });
  } catch (err) {
    console.error('[leads-admin] list error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/admin/leads/:email — full cross-reference for a single lead.
router.get('/:email', async (req, res) => {
  try {
    const email = (req.params.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'missing_email' });
    const state = await getContactState(email);
    const active = await getActiveInstances(email);
    const events = await listFunnelEvents({ email, limit: 50 });
    const postbacks = await listPostbackLogs({ limit: 50 });
    const filteredPostbacks = postbacks.filter((p) => (p.email || '').toLowerCase() === email);
    let transactions = [];
    try {
      const p = getPool();
      const tx = await p.query(
        `SELECT transaction_id, product, value, currency, status, created_at
         FROM transactions WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC`,
        [email]
      );
      transactions = tx.rows;
    } catch (e) { /* table may not exist yet */ }

    res.json({
      ok: true,
      state: state || null,
      active_automations: active.map((a) => a.automation_key),
      events: events,
      postbacks: filteredPostbacks,
      transactions,
    });
  } catch (err) {
    console.error('[leads-admin] detail error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
