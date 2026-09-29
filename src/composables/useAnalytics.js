// Generic analytics hook. Fires our OWN events; third-party IDs from the original
// funnel are kept ONLY as commented reference below — not activated.
//
// --- ORIGINAL FUNNEL TRACKING (REFERENCE ONLY, DO NOT ACTIVATE) ---
// GA4:        G-11R9QPX4PW
// Utmify:     pixelId 697cfd6531f877b2aeb9bf85  (cdn.utmify.com.br/scripts/pixel/pixel.js)
// PostHog:    phc_kYMKXCuS6fdtStVHRKdk8sBiWAqdASfAjLhPLtL7zqC2dd5  via proxy t.misteriosdaalma.com
// Facebook:   fbevents.js (pixel id in cookie)
// ---------------------------------------------------------------------

import { config } from '../config.js';
import { fireEvent } from './useEvent.js';

function getUtmPrefix() {
  try {
    const raw = localStorage.getItem('utm_params');
    if (!raw) return '';
    const p = JSON.parse(raw);
    return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      .filter((k) => p[k])
      .map((k) => `${k}=${p[k]}`)
      .join('|');
  } catch {
    return '';
  }
}

export function track(eventName, props = {}) {
  const payload = {
    event: eventName,
    funnel_name: config.FUNNEL_NAME,
    utm_prefix: getUtmPrefix(),
    ts: Date.now(),
    ...props,
  };
  // Console log as the lightweight own-analytics sink. Replace with your own
  // PostHog/GA4 project here if desired.
  console.log('[analytics]', payload);

  // Best-effort: forward funnel events to the backend automation engine so
  // state transitions + recovery sequences trigger (spec §4). Non-taxonomy
  // events (e.g. internal UI) are skipped by the backend's known-set but still
  // logged. Use dedupe so reloads don't double-fire identical events.
  fireEvent(eventName, props, { dedupe: true }).catch(() => {});

  // Optional: if you later add your own PostHog, call it here, e.g.:
  // if (window.posthog) window.posthog.capture(eventName, payload);
}
