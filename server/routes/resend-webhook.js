// Resend webhook receiver (delivery/bounce/complaint events).
//
// Resend signs webhooks with svix headers (svix-id, svix-timestamp,
// svix-signature). Verification is a manual HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{rawBody}" with the base64-decoded secret
// (RESEND_WEBHOOK_SECRET, format whsec_...), timing-safe compared — no
// extra dependency needed. Requires req.rawBody, captured by the JSON
// middleware in index.js.
//
// Correlation: Resend does NOT echo send-time custom headers/params back in
// webhook payloads, so events are matched via data.message_id (Resend email
// id) -> email_tracking.provider_message_id -> our track_id.
//
// Docs: https://resend.com/docs/webhooks/event-types
import { Router } from 'express';
import crypto from 'crypto';
import { recordEvent, getTrackIdByProviderMessageId } from '../services/email-tracking.js';
import { ingestEvent } from '../services/automation-engine.js';

const router = Router();

const TOLERANCE_SEC = 5 * 60; // reject stale/future timestamps (replay guard)

/**
 * Timing-safe svix signature verification over the raw body.
 */
function verifySvixSignature(rawBody, headers, secret) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (!id || !timestamp || !signature || !rawBody || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const drift = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (drift > TOLERANCE_SEC) return false;

  // Strip the "v1," prefix; support multiple space-separated signature schemes.
  const signatures = String(signature).split(' ').map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3));
  if (signatures.length === 0) return false;

  // whsec_ secrets are base64; tolerate both bare-base64 and prefixed forms.
  const b64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key;
  try {
    key = Buffer.from(b64, 'base64');
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);
  for (const sig of signatures) {
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

// Resend event -> our event_type vocabulary (matches funnel-state.js).
const EVENT_TYPE_MAP = {
  'email.delivered': 'delivered',
  'email.bounced': 'hard_bounce',   // refined by bounce.type below
  'email.complained': 'complaint',
  'email.failed': 'soft_bounce',
};

// POST /api/resend/webhook
// Payload shape: { type, created_at, data: { message_id, email_id, to, bounce: { type } } }
router.post('/', async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // Open webhook when no secret is configured (dev), like the Brevo route was.
  if (secret && !verifySvixSignature(req.rawBody, req.headers, secret)) {
    return res.status(401).json({ ok: false, error: 'invalid_signature' });
  }

  // Always 200 so Resend doesn't retry the whole batch on a single bad row.
  const payload = req.body || {};
  const data = payload.data || {};
  const type = payload.type || '';
  let evType = EVENT_TYPE_MAP[type];
  if (!evType) return res.json({ ok: true, ignored: type }); // opened/clicked: self-hosted tracking covers

  // Permanent vs Temporary bounce.
  if (type === 'email.bounced' && data.bounce?.type !== 'Permanent') {
    evType = 'soft_bounce';
  }

  try {
    const trackId = await getTrackIdByProviderMessageId(data.message_id || data.email_id);
    if (!trackId) return res.json({ ok: true, unmatched: true });

    await recordEvent(trackId, evType).catch(() => {});

    // hard_bounce / complaint must also suppress the contact (spec §8):
    // funnel-state.js patches hard_bounce/suppression flags on these names.
    if (evType === 'hard_bounce' || evType === 'complaint') {
      const email = (Array.isArray(data.to) ? data.to[0] : data.to || '').toString().toLowerCase();
      if (email) {
        await ingestEvent({
          event_name: evType,
          event_id: `resend_webhook_${evType}_${data.message_id || data.email_id}`,
          email,
          funnel_name: process.env.FUNNEL_NAME || 'angel_guarda',
          occurred_at: payload.created_at || new Date().toISOString(),
          page_url: '',
          utm: {},
          metadata: { source: 'resend_webhook' },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[resend-webhook] error', err.message);
  }

  res.json({ ok: true });
});

export default router;