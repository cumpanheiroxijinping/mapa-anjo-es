// POST /api/event — funnel event ingestion from the frontend (spec §4).
//
// Body (any subset, but event_id + event_name + email recommended):
// {
//   "event_name": "vsl2_offer_reached",
//   "event_id": "uuid-v4",               // idempotency (spec §15)
//   "email": "lead@example.com",
//   "funnel_name": "angel_guarda",
//   "occurred_at": "2026-09-29T14:00:00Z",
//   "page_url": "https://mapa.timeoffaith.online/",
//   "utm": { "source": "facebook", ... },
//   "metadata": { "step": 3, "offer_id": "main" }
// }

import { Router } from 'express';
import { ingestEvent } from '../services/automation-engine.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Known funnel event taxonomy (spec §4) — informational validation only.
const KNOWN_EVENTS = new Set([
  'landing_viewed', 'quiz_started', 'quiz_progress', 'quiz_back', 'quiz_completed',
  'quiz_abandoned', 'vsl1_started', 'vsl1_25', 'vsl1_50', 'vsl1_75', 'vsl1_offer_reached',
  'email_capture_shown', 'email_submitted', 'lead_conversion', 'vsl1_to_vsl2',
  'vsl2_started', 'vsl2_25', 'vsl2_50', 'vsl2_75', 'vsl2_offer_reached',
  'vsl2_cta_clicked', 'exit_intent_shown', 'exit_intent_cta_clicked',
  'checkout_redirected', 'checkout_viewed', 'checkout_started', 'checkout_form_completed',
  'payment_attempted', 'payment_pending', 'payment_failed', 'purchase_completed',
  'purchase_refunded', 'chargeback_opened', 'thank_you_viewed', 'delivery_sent',
  'delivery_opened', 'upsell_viewed', 'upsell_cta_clicked', 'upsell_completed',
  'upsell_declined', 'support_requested', 'unsubscribe', 'checkout_abandoned',
  'hard_bounce',
]);

// Optional light auth: if EVENT_API_TOKEN is set, require Bearer or ?token=.
function authorized(req) {
  const token = process.env.EVENT_API_TOKEN;
  if (!token) return true;
  const provided = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7)
    : req.query.token;
  return provided === token;
}

router.post('/', async (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const body = req.body || {};
    const eventName = (body.event_name || '').toString().trim();
    if (!eventName) {
      return res.status(400).json({ ok: false, error: 'missing_event_name' });
    }
    if (!KNOWN_EVENTS.has(eventName)) {
      // Unknown event names are still logged but not fatal.
      console.warn(`[event] unknown event_name: ${eventName}`);
    }

    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      // Many events (e.g. pre-capture quiz) legitimately have no email yet.
      // We still record but cannot key automations. Accept with a warning.
      if (body.event_id) {
        // store without email keying
        const { ingestEvent } = await import('../services/automation-engine.js');
        await ingestEvent({
          event_name: eventName,
          event_id: body.event_id,
          email: null,
          funnel_name: body.funnel_name || process.env.FUNNEL_NAME || 'angel_guarda',
          occurred_at: body.occurred_at || new Date().toISOString(),
          page_url: body.page_url || '',
          utm: body.utm || {},
          metadata: body.metadata || {},
        });
        return res.json({ ok: true, no_email: true });
      }
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const eventId = body.event_id || `${eventName}_${email}_${Date.now()}`;
    const { inserted, started } = await ingestEvent({
      event_name: eventName,
      event_id: eventId,
      email,
      funnel_name: body.funnel_name || process.env.FUNNEL_NAME || 'angel_guarda',
      occurred_at: body.occurred_at || new Date().toISOString(),
      page_url: body.page_url || '',
      utm: body.utm || {},
      metadata: body.metadata || {},
    });

    res.json({ ok: true, idempotent: !inserted, started });
  } catch (err) {
    console.error('[event] error', err);
    res.status(500).json({ ok: false, error: 'server_error', message: err.message });
  }
});

export default router;
