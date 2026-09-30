// GET/POST /api/monitor/* — lead & recovery monitoring + bulk re-engagement.
// All routes are admin-protected (ADMIN_TOKEN). Read endpoints return JSON;
// POST /trigger-event runs async (202) and processes in the background.

import { Router } from 'express';
import {
  listContactStates, getRecoveryQueue, listPostbackLogs,
  listFunnelEvents, listContactEmails,
  insertBulkJob,
  countBulkJob,
} from '../db.js';
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
//
// Items are written to the persistent bulk_jobs table (not run in-memory), so a
// container restart mid-run does not lose progress — the processor reclaims
// anything left 'processing' or still 'pending'.
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

  if (!targets.length) {
    return res.status(200).json({ ok: true, accepted: false, mode, targets: 0, message: 'no_targets' });
  }

  // Enqueue each target as a persistent job item.
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = mode === 'reapply' ? EVENT_MAP[body.event]?.key : null;
  for (const email of targets) {
    if (!email) continue;
    await insertBulkJob({
      jobId,
      mode,
      event: mode === 'reapply' ? body.event : null,
      automationKey: key,
      template: mode === 'resend' ? body.template : null,
      email,
      payload: { segment: body.segment, tag: body.tag || null },
    });
  }

  res.status(202).json({ ok: true, accepted: true, mode, jobId, targets: targets.length });
});

// GET /api/monitor/trigger-event/:jobId — progress of a bulk job (counts by status).
router.get('/trigger-event/:jobId', async (req, res) => {
  try {
    const counts = await countBulkJob(req.params.jobId);
    const map = { pending: 0, processing: 0, done: 0, error: 0 };
    for (const c of counts) map[c.status] = c.c;
    res.json({ ok: true, jobId: req.params.jobId, counts: map, total: Object.values(map).reduce((a, b) => a + b, 0) });
  } catch (err) {
    console.error('[monitor] job progress error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
