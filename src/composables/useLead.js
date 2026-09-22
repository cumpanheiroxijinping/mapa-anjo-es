// Submit a lead to our backend (which persists to Postgres + Brevo).
import { config } from '../config.js';
import { getUtm } from './useUtm.js';

export async function submitLead(lead) {
  const { params, utmPrefix } = getUtm();
  const payload = {
    ...lead,
    utm_source: params.utm_source,
    utm_medium: params.utm_medium,
    utm_campaign: params.utm_campaign,
    utm_term: params.utm_term,
    utm_content: params.utm_content,
    utm_prefix: utmPrefix,
    funnel_name: config.FUNNEL_NAME,
  };
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('[lead] submit failed', err);
    return { ok: false, error: 'network' };
  }
}
