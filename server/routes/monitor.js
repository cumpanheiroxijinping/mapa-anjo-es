// GET/POST /api/monitor/* — lead & recovery monitoring + bulk re-engagement.
// All routes are admin-protected (ADMIN_TOKEN). Read endpoints return JSON;
// POST /trigger-event runs async (202) and processes in the background.

import { Router } from 'express';
import {
  listContactStates, getRecoveryQueue, listPostbackLogs,
  listFunnelEvents, listContactEmails,
  getActiveInstances, endAutomationInstance, cancelPendingByEmail, getContactState,
} from '../db.js';
import { ingestEvent } from '../services/automation-engine.js';
import { sendTemplateEmail } from '../services/email-sender.js';
import { computeSendAt } from '../util/timezone.js';
import { authenticateToken } from '../middleware.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// User-facing event labels -> real event names + automation keys.
const EVENT_MAP = {
  abandonment: { event_name: 'checkout_abandoned', key: 'F' },
  rejected: { event_name: 'payment_failed', key: 'G' },
  canceled: { event_name: 'payment_failed', key: 'G' },
};

router.use(authenticateToken);

// GET /api/monitor/leads?funnel_stage=&main_product_status=&suppression_recovery=&primary_challenge=&tag=&search=&limit=&offset=
router.get('/leads', async (req, res) => {
  try {
    const q = req.query;
    const limit = Math.min(Number(q.limit) || 50, 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const suppression =
      q.suppression_recovery === '' || q.suppression_recovery === undefined
        ? undefined
        : (q.suppression_recovery === 'true' || q.suppression_recovery === '1');
    const { rows, total } = await listContactStates({
      funnel_stage: q.funnel_stage || undefined,
      main_product_status: q.main_product_status || undefined,
      suppression_recovery: suppression,
      primary_challenge: q.primary_challenge || undefined,
      tag: q.tag || undefined,
      search: q.search || undefined,
      limit, offset,
    });
    res.json({ ok: true, total, limit, offset, leads: rows });
  } catch (err) {
    console.error('[monitor] leads error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/monitor/recovery?keys=F,G,C,D,E&includeTest=1
router.get('/recovery', async (req, res) => {
  try {
    const keys = (req.query.keys || 'F,G,C,D,E')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const queue = await getRecoveryQueue({ automationKeys: keys, excludeTest: !req.query.includeTest });
    res.json({ ok: true, queue });
  } catch (err) {
    console.error('[monitor] recovery error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/monitor/postbacks?limit=&offset=&includeTest=1
router.get('/postbacks', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const postbacks = await listPostbackLogs({ excludeTest: !req.query.includeTest, limit, offset });
    res.json({ ok: true, postbacks });
  } catch (err) {
    console.error('[monitor] postbacks error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/monitor/funnel-events?email=&from=&to=&limit=&offset=
router.get('/funnel-events', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const events = await listFunnelEvents({
      email: req.query.email || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit, offset,
    });
    res.json({ ok: true, events });
  } catch (err) {
    console.error('[monitor] funnel-events error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /api/monitor/trigger-event
//  body: { mode: 'reapply'|'resend', event?, segment?, tag?, template? }
//  - reapply: re-ingest an event for all leads in segment (restarts F/G).
//  - resend:  re-send a stage template via Brevo for all leads with `tag`.
router.post('/trigger-event', async (req, res) => {
  const body = req.body || {};
  const mode = body.mode;
  if (!['reapply', 'resend'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'invalid_mode' });
  }

  let targets = [];
  if (mode === 'reapply') {
    if (!EVENT_MAP[body.event]) {
      return res.status(400).json({ ok: false, error: 'invalid_event' });
    }
    // 'todos' = every contact; 'tag' = only leads with that tag.
    targets = await listContactEmails({ tag: body.segment === 'tag' ? body.tag : undefined });
  } else {
    if (!body.tag || !body.template) {
      return res.status(400).json({ ok: false, error: 'missing_tag_or_template' });
    }
    targets = await listContactEmails({ tag: body.tag });
  }

  // Fire-and-forget (mirrors the postback handler pattern).
  runBulkJob(mode, body, targets).catch((err) =>
    console.error('[monitor] bulk job error', err)
  );

  res.status(202).json({ ok: true, accepted: true, mode, targets: targets.length });
});

// ---------------------------------------------------------------- bulk job
async function runBulkJob(mode, body, emails) {
  const ts = Date.now();

  if (mode === 'reapply') {
    const { event_name, key } = EVENT_MAP[body.event];
    for (const email of emails) {
      try {
        // End any active instance of this automation so evaluateTriggers can
        // re-create it (upsert has ON CONFLICT ... WHERE status='active').
        const active = await getActiveInstances(email);
        const inst = active.find((a) => a.automation_key === key);
        if (inst) {
          await endAutomationInstance(inst.id, 'cancelled');
          await cancelPendingByEmail(email, { onlyAutomationKey: key });
        }
        await ingestEvent({
          event_name,
          event_id: `monitor_reapply_${body.event}_${email}_${ts}`,
          email,
          funnel_name: process.env.FUNNEL_NAME || 'angel_guarda',
          occurred_at: new Date().toISOString(),
          page_url: '',
          utm: {},
          metadata: { source: 'monitor_reapply', segment: body.segment, tag: body.tag || null },
        });
      } catch (e) {
        console.error(`[monitor] reapply failed for ${email}`, e.message);
      }
    }
    return;
  }

  // mode === 'resend' — send the stage template via Brevo, no automation restart.
  for (const email of emails) {
    try {
      if (!EMAIL_RE.test(email)) continue;
      const state = (await getContactState(email)) || { email };
      // Respect the silent window: schedule if currently silent, else send now.
      const sendAt = computeSendAt(new Date().toISOString(), 0, state.timezone || 'America/Mexico_City');
      if (sendAt && new Date(sendAt) > new Date()) {
        // Would land in the silent window — send immediately anyway per request,
        // but log so operators know it bypassed the roll.
        console.log(`[monitor] resend to ${email} bypassing silent-window roll`);
      }
      await sendTemplateEmail({
        email,
        template: body.template,
        lead: state,
        vars: { challenge: state.primary_challenge || '' },
        tags: ['monitor_resend', body.tag],
        params: { monitor_resend: true },
      });
    } catch (e) {
      console.error(`[monitor] resend failed for ${email}`, e.message);
    }
  }
}

export default router;
