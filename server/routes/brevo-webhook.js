import { Router } from 'express';
import { recordEvent } from '../services/email-tracking.js';

const router = Router();

// Map Brevo webhook event names -> our event_type vocabulary.
const EVENT_MAP = {
  delivered: 'delivered',
  open: 'open',
  click: 'click',
  hard_bounce: 'hard_bounce',
  soft_bounce: 'soft_bounce',
  unsubscribe: 'unsubscribed',
  complaint: 'complaint',
  blocked: 'hard_bounce',
};

function tokenValid(req) {
  const expected = process.env.BREVO_WEBHOOK_TOKEN;
  if (!expected) return true; // optional: open if unset
  const provided = req.headers['x-brevo-signature'] || req.query.token;
  return provided === expected;
}

// POST /api/brevo/webhook
// Brevo sends either a single event object or an array of events.
// Shape: { event, email, params: { track_id }, ... } and for clicks, `url`.
router.post('/', async (req, res) => {
  // Always 200 so Brevo doesn't retry the whole batch on a single bad row.
  if (!tokenValid(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const payload = req.body;
  const events = Array.isArray(payload) ? payload : [payload];

  for (const ev of events) {
    if (!ev) continue;
    const evType = EVENT_MAP[ev.event] || ev.event;
    const trackId = ev.params?.track_id || ev.track_id || null;
    const url = ev.url || '';
    if (!trackId) continue; // can't correlate without a track id
    recordEvent(trackId, evType, {
      url,
      ip: ev.ip || '',
      userAgent: ev['user-agent'] || '',
    }).catch(() => {});
  }

  res.json({ ok: true });
});

export default router;
