// POST /api/postback/hotmart — Hotmart Webhooks API (v2) server-side postback.
//
// Authentication: NOT a token in the body. Hotmart signs the raw request body
// with HMAC-SHA256, delivered in the `X-Hotmart-Signature` header as a hex
// digest (sometimes prefixed "sha256="). We verify it against HOTMART_TOKEN.
//
// Real payload shape (Hotmart Webhooks API v2, PURCHASE_APPROVED example):
// {
//   "id": "1234567890123456789",
//   "data": {
//     "buyer": {
//       "email": "buyer@email.com",
//       "address": { "city", "state", "address", "country", "zipcode" },
//       "last_name", "first_name", "checkout_phone"
//     },
//     "product": { "name": "My Product" },
//     "purchase": {
//       "origin": { "src": "123" },
//       "original_offer_price": { "value": "134", "currency_value": "BRL" }
//     }
//   },
//   "event": "PURCHASE_APPROVED"
// }

import crypto from 'crypto';
import { Router } from 'express';
import { getPool, insertPostbackLog, upsertContactState, upsertTransaction } from '../db.js';
import { ingestEvent } from '../services/automation-engine.js';

const router = Router();

const HOTMART_TOKEN = process.env.HOTMART_TOKEN || '';

// Hotmart Webhooks event -> internal event name (spec §6 state machine).
const EVENT_MAP = {
  PURCHASE_APPROVED: 'purchase_completed',
  PURCHASE_COMPLETE: 'purchase_completed',
  PURCHASE_CANCELED: 'payment_failed', // post-payment cancellation (recoverable)
  PURCHASE_REFUNDED: 'purchase_refunded',
  PURCHASE_CHARGEBACK: 'chargeback_opened',
  REFUND: 'purchase_refunded',
  CHARGEBACK: 'chargeback_opened',
  BILLET_PRINTED: 'payment_pending', // boleto/OXXO awaiting payment
  PURCHASE_DELAYED: 'payment_pending',
  ABANDONED_CHECKOUT: 'checkout_abandoned', // pre-payment abandonment
};

function signatureValid(rawBody, headerSig) {
  if (!HOTMART_TOKEN) {
    console.warn('[hotmart] HOTMART_TOKEN not set — refusing (fail closed)');
    return false;
  }
  if (!headerSig) return false;
  // Header may arrive as "sha256=<hex>" or plain "<hex>".
  const provided = headerSig.startsWith('sha256=') ? headerSig.slice(7) : headerSig;
  const expected = crypto.createHmac('sha256', HOTMART_TOKEN).update(rawBody).digest('hex');
  // Constant-time compare.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeEmail(raw) {
  if (!raw) return null;
  const e = raw.toString().trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

router.post('/hotmart', async (req, res) => {
  // Always respond 2xx fast (spec §14: responder rápido).
  const rawBody = req.rawBody || JSON.stringify(req.body);
  if (!signatureValid(rawBody, req.headers['x-hotmart-signature'])) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  // Process async (fire-and-forget) but respond immediately.
  handlePostback(req.body).catch((err) =>
    console.error('[hotmart] async error', err)
  );

  res.json({ ok: true, received: true });
});

async function handlePostback(body) {
  const id = body.id || body.transaction_id || body.code;
  if (!id) {
    console.warn('[hotmart] postback without id — ignored');
    return;
  }

  const event = (body.event || '').toString().trim();
  const mappedEvent = EVENT_MAP[event];
  if (!mappedEvent) {
    console.warn(`[hotmart] unknown event "${event}" — logged only`);
  }

  const data = body.data || {};
  const buyer = data.buyer || {};
  const purchase = data.purchase || {};
  const email = normalizeEmail(buyer.email);

  // Idempotent + status-change-aware log (pending -> approved must reapply).
  // We store the Hotmart event as `status` for parity with the PP log.
  const { statusChanged } = await insertPostbackLog({
    code: String(id),
    email,
    rawPayload: body,
    status: event,
    mappedEvent: mappedEvent || null,
  });

  if (!mappedEvent) return;
  // If we already processed this exact event, skip re-applying.
  if (!statusChanged && (await alreadyApplied(id, mappedEvent))) {
    console.log(`[hotmart] ${id} event ${event} already applied — skip`);
    return;
  }

  // Ensure contact state exists (enriched from payload).
  if (email) {
    const patch = {};
    if (buyer.checkout_phone) patch.phone = buyer.checkout_phone;
    if (buyer.address?.country) patch.country = normalizeCountry(buyer.address.country);
    await upsertContactState(email, patch);
  }

  // Record/refresh the transaction row (powers the "Clientes" admin area).
  const price = purchase.original_offer_price || purchase?.offer?.price;
  if (id) {
    try {
      await upsertTransaction({
        code: String(id),
        email,
        name: [buyer.first_name, buyer.last_name].filter(Boolean).join(' ').trim() || null,
        product: data.product?.name || null,
        value: price?.value != null ? Number(price.value) : null,
        currency: price?.currency_value || null,
        status: mappedEvent, // normalized internal event as status
        rawPayload: body,
      });
    } catch (txErr) {
      console.error('[hotmart] transaction upsert error', txErr);
    }
  }

  // Build normalized event and ingest through the same pipeline.
  await ingestEvent({
    event_name: mappedEvent,
    event_id: `${id}_${event}`, // idempotent per id+event
    email,
    funnel_name: process.env.FUNNEL_NAME || 'angel_guarda',
    occurred_at: new Date().toISOString(),
    page_url: '',
    utm: {},
    metadata: {
      order_id: String(id),
      offer_id: 'main', // Hotmart payload has no offer_id
      payment_method: 'hotmart', // local Latam methods (OXXO etc)
      amount: price?.value != null ? Number(price.value) : undefined,
      currency: price?.currency_value || undefined,
      product_name: data.product?.name || undefined,
      src: purchase?.origin?.src || undefined,
    },
  });
}

// Hotmart sends country as display name ("Brasil"); normalize to ISO-2 when
// we recognize it, otherwise leave as-is.
function normalizeCountry(name) {
  const map = { brasil: 'BR', mexico: 'MX', 'estados unidos': 'US', usa: 'US' };
  const key = (name || '').toString().trim().toLowerCase();
  return map[key] || name;
}

// Lightweight guard to avoid double-applying the same id+event.
async function alreadyApplied(id, event) {
  try {
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM funnel_events WHERE event_name = $2
       AND metadata->>'order_id' = $1 LIMIT 1`,
      [String(id), event]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

export default router;
