// UTM capture + persistence (localStorage + cookie) and re-append to links.
// Replicates the Utmify concept from the original funnel without the third-party script.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const STORAGE_KEY = 'utm_params';
const COOKIE_NAME = 'utm_prefix';
const COOKIE_MAX_AGE_DAYS = 180;

function readFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const found = {};
  let any = false;
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) {
      found[k] = v;
      any = true;
    }
  }
  return any ? found : null;
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStored(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function buildUtmPrefix(params) {
  // Combined "utm_prefix" string, e.g. utm_source=facebook|utm_campaign=...
  return UTM_KEYS.filter((k) => params[k]).map((k) => `${k}=${params[k]}`).join('|');
}

export function initUtm() {
  const fromUrl = readFromUrl();
  const stored = readStored();
  const merged = { ...stored, ...(fromUrl || {}) };
  if (fromUrl) writeStored(merged);
  const prefix = buildUtmPrefix(merged);
  if (prefix) setCookie(COOKIE_NAME, prefix, COOKIE_MAX_AGE_DAYS);
  return { params: merged, utmPrefix: prefix };
}

export function getUtm() {
  const stored = readStored();
  return { params: stored, utmPrefix: buildUtmPrefix(stored) };
}

// Append utm_* params (and utm_prefix) to a checkout/CTA URL.
export function appendUtm(url) {
  try {
    const { params, utmPrefix } = getUtm();
    const u = new URL(url, window.location.origin);
    for (const k of UTM_KEYS) {
      if (params[k] && !u.searchParams.has(k)) u.searchParams.set(k, params[k]);
    }
    if (utmPrefix && !u.searchParams.has('utm_prefix')) u.searchParams.set('utm_prefix', utmPrefix);
    return u.toString();
  } catch {
    return url;
  }
}
