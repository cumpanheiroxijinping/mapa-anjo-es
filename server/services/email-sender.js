// Brevo Transactional Email Service (ported + hardened from ZAPSPY).
//
// Sends templated transactional emails via Brevo's SMTP/Transactional API
// (POST /v3/smtp/email), reading templates from local .txt files and
// substituting lead variables at send time.
//
// Differences from the original ZAPSPY module:
//   - DB is NOT coupled: lead data is passed in by the caller (leadToTemplateVars).
//   - fetch() has a timeout (AbortController) + bounded retry with backoff.
//   - Open/click tracking pixel is optional (set TRACKING_BASE_URL; pass trackId).
//   - Variable set expanded to the angel_guarda `leads` schema (gender, civil
//     status, birth_year -> AGE, zodiac_sign, life_challenge, utm_*).
//
// Docs: https://developers.brevo.com/reference/sendtransacemail

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildUnsubscribeToken } from './link-tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'email-templates');

const BREVO_API_URL = (process.env.BREVO_API_BASE_URL || 'https://api.brevo.com/v3').replace(/\/$/, '');

// --- Config (env-driven, no hardcoding of secrets) ---
function getApiKey() {
  return process.env.BREVO_API_KEY || '';
}
function getSenderEmail() {
  return process.env.BREVO_SENDER_EMAIL || 'noreply@mapa-del-angel.com';
}
function getSenderName() {
  return process.env.BREVO_SENDER_NAME || 'Mapa del Ángel de la Guarda';
}
function getTrackingBaseUrl() {
  return (process.env.TRACKING_BASE_URL || '').replace(/\/$/, '');
}

/**
 * Resolve a template file path.
 * @param {string} template - logical name, e.g. "welcome_1" or "angel_guarda/welcome_1"
 */
export function getTemplateFile(template) {
  // Allow either "folder/name" or just "name" (defaults to email-templates root).
  const rel = template.includes('/') ? template : path.join('angel_guarda', template);
  const candidates = [
    path.join(TEMPLATES_DIR, rel + '.txt'),
    path.join(TEMPLATES_DIR, rel),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) return fp;
  }
  throw new Error(`Email template not found: ${template} (looked in ${candidates.join(', ')})`);
}

/**
 * Parse a .txt template into { subject, preheader, fromName, fromEmail, html }.
 * Header lines supported:
 *   Subject line: <value>          (value may be on this line or next non-empty line)
 *   Preheader: <value>
 *   From: Name - email | email
 * Body is everything from <!DOCTYPE/<html onwards (or the whole file).
 */
export function parseTemplateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');

  function valueAfterLabel(rawText, label) {
    const lines = rawText.split(/\r?\n/);
    const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(.*)$');
    for (const line of lines) {
      const m = line.trim().match(re);
      if (m && m[1] && m[1].trim()) return m[1].trim();
    }
    const idx = lines.findIndex((l) => l.trim() === label);
    if (idx !== -1) {
      for (let i = idx + 1; i < lines.length; i++) {
        const val = lines[i].trim();
        if (!val) continue;
        if (val.startsWith('<')) break;
        return val;
      }
    }
    return '';
  }

  const subject = valueAfterLabel(raw, 'Subject line:');
  const preheader = valueAfterLabel(raw, 'Preheader:');
  const from = valueAfterLabel(raw, 'From:');

  const htmlStart = raw.search(/<(!DOCTYPE|html)/i);
  const html = htmlStart >= 0 ? raw.slice(htmlStart) : raw;

  let fromName = getSenderName();
  let fromEmail = getSenderEmail();
  if (from) {
    const dashSplit = from.split(' - ');
    if (dashSplit.length === 2) {
      fromName = dashSplit[0].trim() || fromName;
      fromEmail = dashSplit[1].trim() || fromEmail;
    } else if (from.includes('@')) {
      fromEmail = from.trim();
    }
  }

  return { subject, preheader, fromName, fromEmail, html };
}

/**
 * Substitute %KEY% / %KEY|fallback% variables in a string.
 *
 * Syntax (see email-templates/angel_guarda/README_placeholders.md):
 *   %KEY%            -> value of KEY if non-empty, else left untouched (so a
 *                       typo / unknown key never silently wipes content).
 *   %KEY|fallback%   -> value of KEY if non-empty, else the fallback text.
 *
 * This matches what the templates actually use (e.g. %FIRSTNAME|querida amiga%,
 * %AGE|tu etapa actual%, %BIRTH_MONTH|un mes especial%).
 *
 * @param {string} text
 * @param {Record<string,string>} vars
 */
export function substituteVariables(text, vars = {}) {
  if (!text) return text;
  return text.replace(/(%[A-Z_][A-Z0-9_]*(\|[^%]*)?%)/g, (match) => {
    const inner = match.slice(1, -1); // strip surrounding %
    const pipeIdx = inner.indexOf('|');
    const key = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
    const fallback = pipeIdx === -1 ? null : inner.slice(pipeIdx + 1);

    const raw = vars[key];
    const value = raw == null ? '' : String(raw).trim();
    if (value) return value;

    // No value: use fallback if provided, else leave the original token intact
    // (so an unknown key with no fallback doesn't get erased).
    if (fallback !== null) return fallback;
    return match;
  });
}

/**
 * Inject a self-hosted open-tracking pixel and wrap external links for
 * click tracking. No-op if trackId / TRACKING_BASE_URL are absent.
 */
export function injectTracking(html, trackId) {
  const base = getTrackingBaseUrl();
  if (!trackId || !base) return html;

  const pixel = `<img src="${base}/t/o/${trackId}" width="1" height="1" alt="" style="display:none;height:1px;width:1px;max-height:1px;max-width:1px;opacity:0;overflow:hidden;border:0;margin:0;padding:0" />`;

  let out = html;
  if (out.includes('</body>')) {
    out = out.replace('</body>', `${pixel}</body>`);
  } else {
    out = out + pixel;
  }

  out = out.replace(/<a\b([^>]*)href="(https?:\/\/[^"]*)"([^>]*)>/g, (match, before, url, after) => {
    const lowered = url.toLowerCase();
    if (
      lowered.startsWith('mailto:') ||
      lowered.includes('/privacy') ||
      lowered.includes('/unsubscribe') ||
      url.includes('%UNSUBSCRIBELINK%') ||
      url.includes('/t/c/')
    ) {
      return match;
    }
    const wrapped = `${base}/t/c/${trackId}?url=${encodeURIComponent(url)}`;
    return `<a${before}href="${wrapped}"${after}>`;
  });

  return out;
}

/**
 * fetch with timeout + bounded retry/backoff. Brevo is the only provider.
 */
async function fetchWithRetry(url, options, { retries = 3, timeoutMs = 10000, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        console.warn(`[email-sender] fetch attempt ${attempt + 1} failed (${err.name}); retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr || new Error('fetch failed');
}

/**
 * Map a lead record (angel_guarda `leads` schema) to template variables.
 * Pass whatever subset you have; missing fields become ''.
 *
 * @param {object} lead - { first_name, email, gender, civil_status, birth_day,
 *   birth_year, zodiac_sign, life_challenge, utm_source, utm_medium, ... }
 * @returns {Record<string,string>}
 */
export function leadToTemplateVars(lead = {}, template = '') {
  const age = computeAge(lead.birth_year);
  const base = {
    FIRSTNAME: (lead.first_name || '').toString().split(' ')[0],
    NAME: (lead.first_name || '').toString().trim(),
    EMAIL: (lead.email || '').toString(),
    GENDER: (lead.gender || '').toString(),
    CIVIL_STATUS: (lead.civil_status || '').toString(),
    BIRTH_DAY: (lead.birth_day || '').toString(),
    BIRTH_MONTH: birthMonth(lead.birth_day, lead.zodiac_sign),
    BIRTH_YEAR: (lead.birth_year || '').toString(),
    AGE: age,
    ZODIAC_SIGN: (lead.zodiac_sign || '').toString(),
    LIFE_CHALLENGE: (lead.life_challenge || '').toString(),
    UTM_SOURCE: (lead.utm_source || '').toString(),
    UTM_MEDIUM: (lead.utm_medium || '').toString(),
    UTM_CAMPAIGN: (lead.utm_campaign || '').toString(),
    UTM_TERM: (lead.utm_term || '').toString(),
    UTM_CONTENT: (lead.utm_content || '').toString(),
    UTM_PREFIX: (lead.utm_prefix || '').toString(),
    // New automation variables (spec §12/§13)
    CHECKOUT_URL: process.env.CHECKOUT_URL || '',
    SUPPORT_URL: process.env.SUPPORT_URL || '',
    PRIMARY_CHALLENGE_LABEL: challengeLabel(lead.life_challenge || lead.primary_challenge),
    MARITAL_STATUS_LABEL: maritalLabel(lead.civil_status),
  };

  // Unsubscribe link is built only when a public base URL + email exist.
  const trackBase = (process.env.TRACKING_BASE_URL || '').replace(/\/$/, '');
  const email = (lead.email || '').toString();
  if (trackBase && email) {
    base.UNSUBSCRIBE_URL = `${trackBase}/t/u/${buildUnsubscribeToken(email)}`;
  } else {
    base.UNSUBSCRIBE_URL = process.env.SUPPORT_URL || '#';
  }
  // Resolve intention-based route placeholders (spec §6) for this template.
  const linkPlaceholders = resolveLinkPlaceholders(template || lead._template || '', base);
  return { ...base, ...linkPlaceholders };
}

// =====================================================================
// Link-placeholder resolver (spec §6 / §12).
//
// Templates use intention-based placeholders (%CHECKOUT_REDIRECT_URL%,
// %QUIZ_RESUME_URL%, %VSL2_URL%, %ORDER_STATUS_URL%, %DELIVERY_URL%,
// %UP1_RECOVERY_URL%, ...). This module resolves each to the real public URL
// with campaign params (email_id, stage, challenge, UTMs) appended per the
// template's filename. No email is ever placed in clear text in the URL.
// =====================================================================

const CHALLENGE_SUFFIX = /_(finance|love|health|happiness)$/;

// template prefix -> spec "stage" value (spec §5).
const STAGE_BY_PREFIX = {
  quiz_abandon: 'quiz_abandon',
  lead_vsl2: 'vsl2_lead',
  vsl2_nooffer: 'vsl2_nooffer',
  offer_nocheckout: 'offer_nocheckout',
  checkout_recovery: 'checkout_recovery',
  payment_failed: 'payment_failed',
  payment_pending: 'payment_pending',
  welcome: 'welcome',
  onboarding: 'onboarding',
  upsell_up1: 'up1',
  upsell_up2: 'up2',
  upsell_up3: 'up3',
  refund_support: 'refund_support',
};

function publicBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.TRACKING_BASE_URL ||
    process.env.DEFAULT_EVENT_SOURCE_URL ||
    'https://mapa.timeoffaith.online'
  ).replace(/\/+$/, '');
}

function parseTemplateMeta(template) {
  const file = (template || '').includes('/')
    ? template.split('/').pop()
    : (template || '').toString();
  const chMatch = file.match(CHALLENGE_SUFFIX);
  const challenge = chMatch ? chMatch[1] : '';
  let stage = '';
  for (const [prefix, st] of Object.entries(STAGE_BY_PREFIX)) {
    if (file.startsWith(prefix)) {
      stage = st;
      break;
    }
  }
  return { file, challenge, stage, emailId: file };
}

function pickUtms(vars) {
  const out = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = vars && vars[k];
    if (v) out[k] = String(v);
  }
  return out;
}

function buildRoute(base, path, params) {
  const u = new URL(base + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'challenge' && !v) continue;
    if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * Resolve the intention-based link placeholders for a given template + vars.
 * Returns ONLY the route placeholders (never overrides SUPPORT_URL /
 * UNSUBSCRIBE_URL, which are derived per-email in leadToTemplateVars).
 */
export function resolveLinkPlaceholders(template, vars = {}) {
  const base = publicBaseUrl();
  const { challenge, stage, emailId } = parseTemplateMeta(template);
  const utms = pickUtms(vars);
  const withChallenge = { email_id: emailId, challenge, ...utms };

  return {
    CHECKOUT_REDIRECT_URL: buildRoute(base, '/checkout-redirect', {
      stage: stage || undefined,
      email_id: emailId,
      challenge,
      ...utms,
    }),
    QUIZ_RESUME_URL: buildRoute(base, '/continuar-quiz', withChallenge),
    VSL2_URL: buildRoute(base, '/continuar-vsl2', {
      email_id: emailId,
      challenge,
      vsl_stage: vars.vsl_stage || undefined,
      video_position: vars.video_position || undefined,
      ...utms,
    }),
    ORDER_STATUS_URL: buildRoute(base, '/pedido-status', withChallenge),
    DELIVERY_URL: buildRoute(base, '/entrega', { email_id: emailId, ...utms }),
    UP1_RECOVERY_URL: buildRoute(base, '/up1-recovery', {
      stage: 'up1',
      email_id: 'upsell_up1_1',
      challenge,
      ...utms,
    }),
    UP2_RECOVERY_URL: buildRoute(base, '/up2-recovery', {
      stage: 'up2',
      email_id: 'upsell_up2_1',
      challenge,
      ...utms,
    }),
    UP3_RECOVERY_URL: buildRoute(base, '/up3-recovery', {
      stage: 'up3',
      email_id: 'upsell_up3_1',
      challenge,
      ...utms,
    }),
  };
}

function computeAge(birthYear) {
  if (!birthYear) return '';
  const yr = parseInt(String(birthYear), 10);
  if (!Number.isFinite(yr)) return '';
  const current = new Date().getFullYear();
  const age = current - yr;
  if (age < 0 || age > 130) return '';
  return String(age);
}

// birth_day is stored as "M-D" where M is the 0-based month index (e.g. "3-21"
// = April 21). Derive a human month name (es) for %BIRTH_MONTH%. If birth_day
// is missing, fall back to an approximate month from the zodiac sign. Returns ''
// when nothing can be derived (the template's own fallback then applies).
const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
// Approximate representative month per sign (sign covers late-month + early-next).
const SIGN_MONTH = {
  aries: 'Abril', tauro: 'Mayo', gemeos: 'Junio', cancer: 'Julio',
  leao: 'Agosto', virgem: 'Septiembre', libra: 'Octubre', escorpiao: 'Noviembre',
  sagitario: 'Diciembre', capricornio: 'Enero', aquario: 'Febrero', peixes: 'Marzo',
};

function birthMonth(birthDay, zodiacSign) {
  if (birthDay) {
    const parts = String(birthDay).split('-');
    const m = parseInt(parts[0], 10);
    if (Number.isFinite(m) && m >= 0 && m < 12) return MONTH_NAMES_ES[m];
  }
  if (zodiacSign) {
    const label = SIGN_MONTH[String(zodiacSign).toLowerCase()];
    if (label) return label;
  }
  return '';
}

// Challenge code -> readable label (spec §11). Source field may be the raw
// life_challenge string from the leads table.
const CHALLENGE_LABELS = {
  love: 'tu vida amorosa',
  finance: 'tus finanzas',
  finances: 'tus finanzas',
  financial: 'tus finanzas',
  health: 'tu salud',
  happiness: 'tu felicidad',
  felicidad: 'tu felicidad',
};
const MARITAL_LABELS = {
  solteiro: 'soltero/a',
  soltera: 'soltera',
  casado: 'casado/a',
  casada: 'casada',
  viuvo: 'viudo/a',
  viuva: 'viuda',
  separado: 'separado/a',
  separada: 'separada',
  relacionamento: 'en una relación',
  single: 'soltero/a',
  married: 'casado/a',
  widowed: 'viudo/a',
  divorced: 'separado/a',
  separated: 'separado/a',
  relationship: 'en una relación',
};

function challengeLabel(value) {
  if (!value) return '';
  return CHALLENGE_LABELS[String(value).toLowerCase()] || String(value);
}
function maritalLabel(value) {
  if (!value) return '';
  return MARITAL_LABELS[String(value).toLowerCase()] || String(value);
}

/**
 * Send a transactional email using a local template + caller-supplied vars.
 *
 * @param {object} opts
 * @param {string} opts.email          - recipient
 * @param {string} opts.template       - template logical name (e.g. "welcome_1")
 * @param {Record<string,string>} [opts.vars] - extra/override variables
 * @param {object} [opts.lead]         - lead record; mapped to vars automatically
 * @param {string} [opts.trackId]      - existing track id (generated if omitted)
 * @param {string[]} [opts.tags]       - Brevo tags
 * @param {object} [opts.params]       - extra Brevo `params` (webhook correlation)
 * @returns {Promise<{trackId:string, data:object}>}
 */
export async function sendTemplateEmail({
  email,
  template,
  vars = {},
  lead,
  trackId,
  tags = [],
  params = {},
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Brevo not configured: BREVO_API_KEY missing');
  }
  if (!email) {
    throw new Error('sendTemplateEmail: recipient email is required');
  }

  const tmpl = parseTemplateFile(getTemplateFile(template));

  // Merge: lead-derived vars first, then explicit overrides.
  const mergedVars = { ...leadToTemplateVars(lead, template), ...vars };

  const subject = tmpl.subject ? substituteVariables(tmpl.subject, mergedVars) : '';
  let htmlContent = substituteVariables(tmpl.html, mergedVars);

  // Generate track id lazily (caller may pass one for correlation).
  const effectiveTrackId = trackId || `eml_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (tmpl.preheader) {
    htmlContent =
      `<div style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${tmpl.preheader}</div>` +
      htmlContent;
  }

  htmlContent = injectTracking(htmlContent, effectiveTrackId);

  const payload = {
    sender: { name: tmpl.fromName, email: tmpl.fromEmail },
    to: [{ email }],
    subject,
    htmlContent,
    headers: {
      'X-Param-TrackId': effectiveTrackId,
      'X-Param-Template': template,
    },
    params: {
      track_id: effectiveTrackId,
      template,
      ...params,
    },
    tags: Array.isArray(tags) && tags.length ? tags : [template],
  };

  const response = await fetchWithRetry(`${BREVO_API_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok || (data && data.code && data.code !== 'success')) {
    console.error(`[email-sender] send failed (${response.status}) to ${email} [${template}]:`, data);
    throw new Error(`Brevo send failed: ${data?.message || data?.raw || response.status}`);
  }

  console.log(`[email-sender] sent "${template}" to ${email} trackId=${effectiveTrackId}`);
  return { data, trackId: effectiveTrackId };
}
