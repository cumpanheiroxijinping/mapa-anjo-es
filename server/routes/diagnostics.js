// GET /api/admin/diagnostics — row counts per admin table (auth required).
// Used to verify where real leads live (leads vs contact_states vs transactions).
import { Router } from 'express';
import { authenticateToken, adminLimiter } from '../middleware.js';
import { getPool } from '../db.js';

const router = Router();
router.use(authenticateToken);
router.use(adminLimiter);

router.get('/', async (_req, res) => {
  try {
    const p = getPool();
    const tables = ['leads', 'contact_states', 'transactions', 'automation_instances', 'pending_sends', 'postback_log', 'email_campaigns'];
    const out = {};
    for (const t of tables) {
      try {
        const r = await p.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
        out[t] = r.rows[0].c;
      } catch (e) {
        out[t] = `erro: ${e.message}`;
      }
    }
    // Sample of the first 5 leads (if any) for quick inspection.
    let sample = [];
    try {
      const s = await p.query('SELECT id, first_name, email, zodiac_sign, life_challenge, created_at FROM leads ORDER BY created_at DESC LIMIT 5');
      sample = s.rows;
    } catch (e) { /* ignore */ }
    res.json({ ok: true, counts: out, sampleLeads: sample });
  } catch (err) {
    console.error('[diagnostics] error', err);
    res.status(500).json({ ok: false, error: 'server_error', message: err.message });
  }
});

export default router;
