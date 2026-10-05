// Intentional high-intent redirector (spec §2 / §3.3 / §10).
//
// GET /checkout-redirect?stage=...&email_id=...&challenge=...&offer_id=...
//
// Responsibilities:
//   1. validate the basic params (stage enum, no junk);
//   2. record the click server-side (reuses email_tracking when a track_id is
//      present, otherwise best-effort logs a funnel event — never blocks);
//   3. preserve attribution params (email_id, challenge, UTMs);
//   4. resolve the destination checkout URL via the active provider adapter;
//   5. redirect EXACTLY ONCE (302) to the active provider;
//   6. do NOT insert a sales page in between;
//   7. do NOT store card/financial data;
//   8. do NOT mark a purchase just because this route was visited.
//
// If the active provider / its URL is not configured, respond with a controlled
// error page (/erro) instead of redirecting to an empty URL.

import { Router } from 'express';
import {
  getActiveProvider,
  getMainCheckoutUrl,
  getUpsellCheckoutUrl,
  buildCheckoutUrl,
  UPSELL_OFFERS,
} from '../services/checkout-provider.js';
import { getPool } from '../db.js';

const router = Router();

// Allowed `stage` values (spec §5). The redirector also accepts upsell stages
// (up1/up2/up3) which map to an upsell checkout URL rather than the main one.
const STAGE_MAP = {
  offer_nocheckout: 'main',
  checkout_recovery: 'main',
  payment_failed: 'main',
  up1: 'up1',
  up2: 'up2',
  up3: 'up3',
};

// Only append opaque identifiers + UTMs to the provider (never email-in-clear,
// never financial data). Reuse the same allow-list as the adapter.
const ALLOWED_TRACKING = [
  'email_id', 'contact_id', 'challenge', 'click_id', 'stage', 'offer_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
];

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .toString().split(',')[0].trim();
}

// Best-effort click log so each click is attributable to the source template
// (spec §12 "cada clique pode ser atribuído ao template de origem"). Mirrors the
// existing email_tracking model but does not require a Brevo track_id.
async function logClick(req, stage, destinationProvider) {
  try {
    const emailId = req.query.email_id || null;
    const p = getPool();
    await p.query(
      `INSERT INTO redirect_clicks
        (email_id, stage, challenge, contact_id, provider, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        emailId,
        stage || null,
        req.query.challenge || null,
        req.query.contact_id || null,
        destinationProvider || null,
        clientIp(req),
        req.headers['user-agent'] || null,
      ]
    );
  } catch (err) {
    // Non-fatal: do not block the redirect on logging failure.
    console.warn('[redirect] click log failed:', err.message);
  }
}

// GET /checkout-redirect
router.get('/checkout-redirect', async (req, res) => {
  const stage = (req.query.stage || '').toString().trim().toLowerCase();
  const offerId = (req.query.offer_id || '').toString().trim().toLowerCase();

  // --- Validate stage / offer -----------------------------------------
  // An explicit offer_id upsell (up1/up2/up3) takes precedence; otherwise the
  // stage must be one of the known high-intent stages.
  let kind = STAGE_MAP[stage] || (UPSELL_OFFERS.includes(offerId) ? offerId : null);

  // If no valid stage, but an offer_id was given, derive from offer_id.
  if (!kind && offerId) kind = UPSELL_OFFERS.includes(offerId) ? offerId : null;

  if (!kind) {
    return res.redirect(302, '/erro?motivo=parametro-invalido');
  }

  // --- Resolve destination via active provider ------------------------
  let baseUrl;
  try {
    if (kind === 'main') {
      baseUrl = getMainCheckoutUrl();
    } else {
      baseUrl = getUpsellCheckoutUrl(kind);
    }
  } catch (err) {
    console.warn('[redirect] provider resolution failed:', err.message);
    return res.redirect(302, `/erro?motivo=${encodeURIComponent('provedor-nao-configurado')}`);
  }

  // --- Build tracking-aware destination -------------------------------
  const tracking = {};
  for (const k of ALLOWED_TRACKING) {
    const v = req.query[k];
    if (v === undefined || v === null) continue;
    tracking[k] = Array.isArray(v) ? v[0] : v;
  }
  const destination = buildCheckoutUrl(baseUrl, tracking);

  // Best-effort click attribution (never blocks the redirect).
  const provider = getActiveProvider();
  logClick(req, stage || kind, provider).catch(() => {});

  // Redirect exactly once.
  res.redirect(302, destination);
});

export default router;
