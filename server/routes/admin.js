import { Router } from 'express';
import { getAllLeads } from '../db.js';
import { leadsToCsv } from '../util/csv.js';

const router = Router();

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

export default router;
