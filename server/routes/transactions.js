// GET /api/admin/transactions (list + filters) and /stats.
// Clients area of the admin — backed by the new `transactions` table.
import { Router } from 'express';
import { authenticateToken, adminLimiter } from '../middleware.js';
import { listTransactions, getTransactionStats } from '../db.js';

const router = Router();

router.use(authenticateToken);
router.use(adminLimiter);

// GET /api/admin/transactions?search=&status=&startDate=&endDate=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const q = req.query;
    const limit = Math.min(Number(q.limit) || 50, 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const { rows, total } = await listTransactions({
      search: q.search || undefined,
      status: q.status || undefined,
      startDate: q.startDate || undefined,
      endDate: q.endDate || undefined,
      limit, offset,
    });
    res.json({ ok: true, total, limit, offset, transactions: rows });
  } catch (err) {
    console.error('[transactions] list error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/admin/transactions/stats
router.get('/stats', async (_req, res) => {
  try {
    const stats = await getTransactionStats();
    res.json({ ok: true, stats });
  } catch (err) {
    console.error('[transactions] stats error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
