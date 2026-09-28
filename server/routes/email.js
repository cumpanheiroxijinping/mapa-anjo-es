import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, listCampaigns, getCampaign } from '../db.js';
import { sendTemplateEmail, parseTemplateFile, substituteVariables, leadToTemplateVars, getTemplateFile } from '../services/email-sender.js';
import {
  createAndEnqueueCampaign,
  buildSegmentWhere,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  retryFailed,
} from '../services/email-campaign.js';
import { createTrackingRecord } from '../services/email-tracking.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'email-templates');

function adminAuth(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    // If ADMIN_TOKEN is unset, fail closed (don't expose admin endpoints).
    return res.status(503).json({ ok: false, error: 'admin_disabled' });
  }
  const auth = req.headers['authorization'] || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
  if (provided !== token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Apply admin auth to everything below.
router.use(adminAuth);

// ----------------------------------------------------------------- Templates

// GET /api/email/templates  -> list available template logical names
router.get('/templates', (_req, res) => {
  try {
    const out = [];
    const walk = (dir, prefix = '') => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (entry.name.endsWith('.txt')) {
          const logical = (prefix ? `${prefix}/` : '') + entry.name.replace(/\.txt$/, '');
          out.push(logical);
        }
      }
    };
    walk(TEMPLATES_DIR);
    res.json({ ok: true, templates: out });
  } catch (err) {
    console.error('[email] list templates error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/email/templates/:name/preview?email=foo@bar.com
// Renders the template with a lead's variables (from Postgres) or a built-in
// sample if no email supplied. Returns subject + html for inspection.
router.get('/templates/:name/preview', async (req, res) => {
  try {
    const name = req.params.name;
    let tmpl;
    try {
      tmpl = parseTemplateFile(getTemplateFile(name));
    } catch (e) {
      return res.status(404).json({ ok: false, error: 'template_not_found', message: e.message });
    }

    let lead = null;
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (email && EMAIL_RE.test(email)) {
      try {
        const p = getPool();
        const r = await p.query(
          `SELECT first_name, email, gender, civil_status, birth_day, birth_year,
                  zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
                  utm_term, utm_content, utm_prefix
           FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
          [email]
        );
        lead = r.rows[0] || null;
      } catch (err) {
        console.error('[email] preview lead lookup failed', err);
      }
    }

    if (!lead) {
      // Sample data so the preview is meaningful.
      const age = 34;
      lead = {
        first_name: 'María', email: email || 'ejemplo@correo.com',
        gender: 'femenino', civil_status: 'soltera',
        birth_day: '12 de marzo', birth_year: String(new Date().getFullYear() - age),
        zodiac_sign: 'Piscis', life_challenge: 'encontrar su propósito',
        utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'lanzamiento',
      };
    }

    const vars = leadToTemplateVars(lead);
    const subject = tmpl.subject ? substituteVariables(tmpl.subject, vars) : '';
    const html = substituteVariables(tmpl.html, vars);

    res.json({
      ok: true,
      name,
      subject,
      html,
      vars,
      from: { name: tmpl.fromName, email: tmpl.fromEmail },
      preheader: tmpl.preheader,
    });
  } catch (err) {
    console.error('[email] preview error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ----------------------------------------------------------------- Campaigns

// POST /api/email/campaign
// Body: { name, template, segment?, vars? }
// segment keys (whitelisted): zodiac_sign, gender, civil_status, source,
//   utm_source, utm_medium, utm_campaign, min_age, max_age, created_since
router.post('/campaign', async (req, res) => {
  try {
    const body = req.body || {};
    const { name, template, segment = {}, vars = {} } = body;
    if (!name || !template) {
      return res.status(400).json({ ok: false, error: 'missing_name_or_template' });
    }
    // Validate the segment compiles (throws on bad input before touching DB).
    buildSegmentWhere(segment);
    const { campaign, enqueued } = await createAndEnqueueCampaign({ name, template, segment, vars });
    res.json({ ok: true, campaign, enqueued });
  } catch (err) {
    console.error('[email] create campaign error', err);
    res.status(500).json({ ok: false, error: 'create_failed', message: err.message });
  }
});

// GET /api/email/campaigns -> list with counts
router.get('/campaigns', async (_req, res) => {
  try {
    const campaigns = await listCampaigns();
    res.json({ ok: true, campaigns });
  } catch (err) {
    console.error('[email] list campaigns error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/email/campaigns/:id -> single campaign
router.get('/campaigns/:id', async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, campaign: c });
  } catch (err) {
    console.error('[email] get campaign error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ----------------------------------------------------------------- Single send

// POST /api/email/send  (admin-protected single transactional send)
// Body: { email, template, vars?, trackId?, tags? }
router.post('/send', async (req, res) => {
  try {
    const body = req.body || {};
    const email = (body.email || '').toString().trim().toLowerCase();
    const template = (body.template || '').toString().trim();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }
    if (!template) {
      return res.status(400).json({ ok: false, error: 'missing_template' });
    }

    let lead = null;
    try {
      const p = getPool();
      const r = await p.query(
        `SELECT first_name, email, gender, civil_status, birth_day, birth_year,
                zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
                utm_term, utm_content, utm_prefix
         FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
        [email]
      );
      lead = r.rows[0] || null;
    } catch (err) {
      console.error('[email] lead lookup failed', err);
    }

    const result = await sendTemplateEmail({
      email,
      template,
      lead: lead || { email },
      vars: body.vars || {},
      trackId: body.trackId,
      tags: body.tags,
      params: body.params,
    });

    // Persist a tracking record so opens/clicks can be correlated later.
    await createTrackingRecord(result.trackId, email, template, null).catch(() => {});

    res.json({ ok: true, trackId: result.trackId });
  } catch (err) {
    console.error('[email] send error', err);
    res.status(500).json({ ok: false, error: 'send_failed', message: err.message });
  }
});

// ----------------------------------------------------------------- Metrics

// GET /api/email/metrics/summary
router.get('/metrics/summary', async (_req, res) => {
  try {
    const { getSummaryMetrics } = await import('../services/email-tracking.js');
    const summary = await getSummaryMetrics();
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[email] metrics summary error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/email/metrics/campaigns
router.get('/metrics/campaigns', async (_req, res) => {
  try {
    const { getMetricsByCampaign } = await import('../services/email-tracking.js');
    const campaigns = await getMetricsByCampaign();
    res.json({ ok: true, campaigns });
  } catch (err) {
    console.error('[email] metrics campaigns error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/email/metrics/recent-events?limit=
router.get('/metrics/recent-events', async (req, res) => {
  try {
    const { getRecentEvents } = await import('../services/email-tracking.js');
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const events = await getRecentEvents(limit);
    res.json({ ok: true, events });
  } catch (err) {
    console.error('[email] recent events error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/email/metrics/daily?days=
router.get('/metrics/daily', async (req, res) => {
  try {
    const { getDailyMetrics } = await import('../services/email-tracking.js');
    const days = Math.min(Number(req.query.days) || 30, 365);
    const daily = await getDailyMetrics(days);
    res.json({ ok: true, daily });
  } catch (err) {
    console.error('[email] daily metrics error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ----------------------------------------------------------------- Campaign actions

// POST /api/email/campaigns/:id/:action  (pause|resume|cancel|retry-failed)
router.post('/campaigns/:id/:action', async (req, res) => {
  try {
    const id = req.params.id;
    const action = req.params.action;
    let result;
    switch (action) {
      case 'pause':
        result = await pauseCampaign(id);
        break;
      case 'resume':
        result = await resumeCampaign(id);
        break;
      case 'cancel':
        result = await cancelCampaign(id);
        break;
      case 'retry-failed':
        result = await retryFailed(id);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'unknown_action' });
    }
    res.json({ ok: true, campaign: result });
  } catch (err) {
    console.error('[email] campaign action error', err);
    res.status(500).json({ ok: false, error: 'server_error', message: err.message });
  }
});

export default router;
