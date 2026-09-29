// Funnel event ingestion client (spec §4/§5).
//
// Sends funnel events to POST /api/event with a stable event_id (UUID) so the
// backend can dedupe (idempotency, spec §15). The same contact_id is persisted
// in localStorage and reused across page loads/navigation so a reload doesn't
// double-fire an event, and so the backend can correlate a returning visitor.
//
// Best-effort: failures are logged but never break the funnel UI.

import { config } from '../config.js';
import { getUtm } from './useUtm.js';

const CONTACT_KEY = 'angel_contact_id';
const FIRED_KEY = 'angel_fired_events'; // JSON array of event_ids already sent

function getContactId() {
  let id = localStorage.getItem(CONTACT_KEY);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(CONTACT_KEY, id);
  }
  return id;
}

function getEmail() {
  // Prefer the captured email if stored; otherwise null (pre-capture events).
  return localStorage.getItem('angel_lead_email') || null;
}

function alreadyFired(eventId) {
  try {
    const arr = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]');
    return arr.includes(eventId);
  } catch {
    return false;
  }
}

function markFired(eventId) {
  try {
    const arr = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]');
    if (!arr.includes(eventId)) {
      arr.push(eventId);
      // keep last 200 to bound storage
      if (arr.length > 200) arr.splice(0, arr.length - 200);
      localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
    }
  } catch {
    /* ignore */
  }
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Fire a funnel event to the backend.
 * @param {string} eventName - taxonomy name (spec §4)
 * @param {object} [props] - { step, key, value, offer_id, ... } -> metadata
 * @param {object} [opts] - { email, dedupe:boolean } ; dedupe=true reuses a
 *   deterministic event_id from (eventName+JSON(props)) so identical events
 *   from a reload are ignored by the backend.
 */
export async function fireEvent(eventName, props = {}, opts = {}) {
  const eventId = opts.dedupe
    ? `${eventName}:${JSON.stringify(props)}`
    : uuid();

  if (opts.dedupe && alreadyFired(eventId)) {
    return { ok: true, idempotent: true };
  }

  const { params, utmPrefix } = getUtm();
  const email = opts.email || getEmail();

  const payload = {
    event_name: eventName,
    event_id: eventId,
    contact_id: getContactId(),
    email,
    funnel_name: config.FUNNEL_NAME,
    occurred_at: new Date().toISOString(),
    page_url: window.location?.href || '',
    utm: {
      source: params.utm_source,
      medium: params.utm_medium,
      campaign: params.utm_campaign,
      term: params.utm_term,
      content: params.utm_content,
      prefix: utmPrefix,
    },
    metadata: props || {},
  };

  try {
    const res = await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // survive navigation
    });
    markFired(eventId);
    return await res.json().catch(() => ({ ok: true }));
  } catch (err) {
    console.warn('[event] send failed', eventName, err?.message);
    return { ok: false, error: 'network' };
  }
}

export function setLeadEmail(email) {
  if (email) localStorage.setItem('angel_lead_email', String(email).toLowerCase());
}
