// Multi-provider checkout adapter (spec §10).
//
// The funnel supports Perfect Pay, Hotmart, Vega and Zenith. The ACTIVE
// provider is selected ONLY via Railway Variables — no code change required to
// switch. Each provider maps its own status + webhook semantics through the
// dedicated postback routers (perfectpay-webhook.js / hotmart-webhook.js); this
// module only resolves the destination checkout URLs for the redirector and the
// email placeholders.
//
// IMPORTANT (spec §10.2): never fall back silently to another provider. If the
// variable for the active provider is missing or mismatched, we return null and
// the caller surfaces a controlled error (no empty/incorrect redirect).

const PROVIDERS = ['perfectpay', 'hotmart', 'vega', 'zenith'];

// Upsell offer ids recognized by the redirector / email placeholder logic.
const UPSELL_OFFERS = ['up1', 'up2', 'up3'];

function env(key, fallback = '') {
  const v = process.env[key];
  return v === undefined || v === null ? fallback : v;
}

/**
 * The provider currently selected by ACTIVE_CHECKOUT_PROVIDER (normalized to
 * lowercase). Returns null if unset or unknown.
 */
export function getActiveProvider() {
  const raw = (process.env.ACTIVE_CHECKOUT_PROVIDER || '').toString().trim().toLowerCase();
  if (!raw || !PROVIDERS.includes(raw)) return null;
  return raw;
}

export function getProviderMeta() {
  const active = getActiveProvider();
  return {
    activeProvider: active,
    supportedProviders: PROVIDERS,
    isConfigured: !!active,
  };
}

/**
 * Resolve the main checkout URL for the active provider.
 * Throws if the active provider is unset/unknown or its URL variable is missing
 * (so the caller can respond with a controlled error instead of redirecting to
 * an empty URL).
 */
export function getMainCheckoutUrl() {
  const active = getActiveProvider();
  if (!active) {
    throw new Error('ACTIVE_CHECKOUT_PROVIDER not set or unknown');
  }
  // Alias MAIN_CHECKOUT_URL is generated/simple; the provider-specific var is
  // the source of truth. We prefer the specific var, then the generic alias.
  const specific = env(`MAIN_CHECKOUT_URL_${active.toUpperCase()}`);
  const generic = env('MAIN_CHECKOUT_URL');
  const url = specific || generic;
  if (!url) {
    throw new Error(`Missing checkout URL for active provider "${active}"`);
  }
  return url;
}

/**
 * Resolve an upsell checkout URL for the given offer id (up1/up2/up3) under the
 * active provider. Throws if missing.
 */
export function getUpsellCheckoutUrl(offerId) {
  const active = getActiveProvider();
  if (!active) {
    throw new Error('ACTIVE_CHECKOUT_PROVIDER not set or unknown');
  }
  if (!UPSELL_OFFERS.includes((offerId || '').toString().toLowerCase())) {
    throw new Error(`Unknown upsell offer_id "${offerId}"`);
  }
  const o = offerId.toString().toLowerCase();
  const specific = env(`UP${o.slice(2).toUpperCase()}_CHECKOUT_URL_${active.toUpperCase()}`);
  const generic = env(`UP${o.slice(2).toUpperCase()}_CHECKOUT_URL`);
  const url = specific || generic;
  if (!url) {
    throw new Error(`Missing upsell checkout URL for offer "${o}" / provider "${active}"`);
  }
  return url;
}

/**
 * Build the final checkout URL by appending only allowed tracking params
 * (identifiers + UTMs). Each provider may accept different param names, but we
 * keep it generic and safe: only opaque identifiers + UTMs, never sensitive
 * data (no email in clear, no card/financial data). Providers that ignore
 * unknown params simply ignore them.
 *
 * @param {string} baseUrl
 * @param {object} tracking - { email_id, contact_id, challenge, click_id, utm_* }
 */
export function buildCheckoutUrl(baseUrl, tracking = {}) {
  if (!baseUrl) return baseUrl;
  const u = new URL(baseUrl);
  const allowed = ['email_id', 'contact_id', 'challenge', 'click_id', 'stage', 'offer_id',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  for (const key of allowed) {
    const val = tracking[key];
    if (val === undefined || val === null || val === '') continue;
    // URL-search-param keys are provider-agnostic; providers read what they need.
    if (!u.searchParams.has(key)) {
      u.searchParams.set(key, String(val));
    }
  }
  return u.toString();
}

/**
 * Validate that the active provider + its required URLs are configured.
 * Returns { ok, provider, error }. Used by diagnostics / a pre-flight check.
 */
export function validateActiveProvider() {
  const active = getActiveProvider();
  if (!active) {
    return { ok: false, provider: active, error: 'ACTIVE_CHECKOUT_PROVIDER not set or unknown' };
  }
  try {
    getMainCheckoutUrl();
    return { ok: true, provider: active, error: null };
  } catch (err) {
    return { ok: false, provider: active, error: err.message };
  }
}

export { PROVIDERS, UPSELL_OFFERS };
