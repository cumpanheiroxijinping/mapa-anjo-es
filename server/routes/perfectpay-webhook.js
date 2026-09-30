// POST /api/postback/perfectpay — Perfect Pay server-side postback (spec §14).
//
// The token is sent IN THE BODY (operator-confirmed). Payload shape (real):
// {
//   "token": "d8d4a7ea9cd4940eba25d8546b68f18a",
//   "code": "12345",
//   "product": { "name": "..." },
//   "customer": { "city","email","state","country","birthday","zip_code",
//                 "full_name","street_name","phone_number" },
//   "metadata": { "src": "easyt_..." },
//   "sale_amount": "385",            // string!
//   "currency_enum_key": "BRL",
//   "sale_status_enum_key": "approved"
// }
//
// Status -> event mapping (operator-confirmed):
//   approved     -> purchase_completed
//   canceled     -> payment_failed   (post-payment)
//   rejected     -> payment_failed   (post-payment)
//   abandonment  -> checkout_abandoned (pre-payment)
//   chargeback   -> chargeback_opened
//   (future) awaiting payment -> payment_pending

import { Router } from 'express';
import { getPool, insertPostbackLog, upsertContactState, upsertTransaction } from '../db.js';
import { ingestEvent } from '../services/automation-engine.js';

const router = Router();

const EXPECTED_TOKEN = process.env.PERFECTPAY_TOKEN || 'd8d4a7ea9cd4940eba25d8546b68f18a';

const STATUS_MAP = {
  approved: 'purchase_completed',
  canceled: 'payment_failed',
  rejected: 'payment_failed',
  abandonment: 'checkout_abandoned',
  chargeback: 'chargeback_opened',
  // future / defensive
  refunded: 'purchase_refunded',
  'awaiting payment': 'payment_pending',
  awaiting_payment: 'payment_pending',
};

function tokenValid(body) {
  const provided = body && body.token;
  return provided === EXPECTED_TOKEN;
}

function normalizeEmail(raw) {
  if (!raw) return null;
  const e = raw.toString().trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

router.post('/perfectpay', async (req, res) => {
  // Always respond 2xx fast (spec §14: responder rápido).
  if (!tokenValid(req.body)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  // Process async (fire-and-forget) but respond immediately.
  handlePostback(req.body).catch((err) =>
    console.error('[perfectpay] async error', err)
  );

  res.json({ ok: true, received: true });
});

async function handlePostback(body) {
  const code = body.code || body.order_id || body.transaction_id;
  if (!code) {
    console.warn('[perfectpay] postback without code/order_id — ignored');
    return;
  }

  const status = (body.sale_status_enum_key || body.status || '').toString().trim().toLowerCase();
  const mappedEvent = STATUS_MAP[status];
  if (!mappedEvent) {
    console.warn(`[perfectpay] unknown status "${status}" — logged only`);
  }

  const email = normalizeEmail(body.customer?.email);
  const customer = body.customer || {};

  // Idempotent + status-change-aware log (pending -> approved must reapply).
  const { statusChanged } = await insertPostbackLog({
    code: String(code),
    email,
    rawPayload: body,
    status,
    mappedEvent: mappedEvent || null,
  });

  if (!mappedEvent) return;
  // If we already processed this exact status, skip re-applying.
  if (!statusChanged && (await alreadyApplied(code, mappedEvent))) {
    console.log(`[perfectpay] ${code} status ${status} already applied — skip`);
    return;
  }

  // Ensure contact state exists (enriched from payload).
  if (email) {
    const patch = {};
    if (customer.country) patch.country = customer.country;
    await upsertContactState(email, patch);
  }

  // Record/refresh the transaction row (powers the "Clientes" admin area).
  if (code) {
    try {
      await upsertTransaction({
        code: String(code),
        email,
        name: customer.full_name || customer.full_name || null,
        product: body.product?.name || null,
        value: body.sale_amount != null ? Number(body.sale_amount) : null,
        currency: body.currency_enum_key || null,
        status,
        rawPayload: body,
      });
    } catch (txErr) {
      console.error('[perfectpay] transaction upsert error', txErr);
    }
  }

  // Build normalized event and ingest through the same pipeline.
  await ingestEvent({
    event_name: mappedEvent,
    event_id: `${code}_${status}`, // idempotent per code+status
    email,
    funnel_name: process.env.FUNNEL_NAME || 'angel_guarda',
    occurred_at: new Date().toISOString(),
    page_url: '',
    utm: {},
    metadata: {
      order_id: String(code),
      offer_id: 'main', // Perfect Pay payload has no offer_id
      payment_method: 'card', // Perfect Pay only card/Apple/Google
      amount: body.sale_amount != null ? Number(body.sale_amount) : undefined,
      currency: body.currency_enum_key || undefined,
      product_name: body.product?.name || undefined,
      src: body.metadata?.src || undefined,
    },
  });
}

// Lightweight guard to avoid double-applying the same code+event.
async function alreadyApplied(code, event) {
  try {
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM funnel_events WHERE event_name = $2
       AND metadata->>'order_id' = $1 LIMIT 1`,
      [String(code), event]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

export default router;
