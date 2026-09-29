// Submit a lead to our backend (which persists to Postgres + Brevo).
import { config } from '../config.js';
import { getUtm } from './useUtm.js';
import { fireEvent, setLeadEmail } from './useEvent.js';

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
    const data = await res.json();
    // After a successful capture, record the email locally (so subsequent
    // funnel events can be keyed) and fire the email_submitted event that
    // kicks off the lead->VSL2 recovery automation (spec §10 C).
    if (data?.ok && lead?.email) {
      setLeadEmail(lead.email);
      fireEvent('email_submitted', {
        source: lead.source || 'vsl1_email_capture',
        challenge: lead.life_challenge,
      }, { email: lead.email }).catch(() => {});
    }
    return data;
  } catch (err) {
    console.error('[lead] submit failed', err);
    return { ok: false, error: 'network' };
  }
}
