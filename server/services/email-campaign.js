// Email broadcast campaign engine + in-process scheduler.
//
// Flow:
//   createCampaign({ name, template, segment, vars })
//     -> builds a safe WHERE clause from `segment`
//     -> enqueues matching leads into email_queue (deduped)
//   The scheduler (startEmailScheduler) periodically picks "running"/"queued"
//   campaigns and sends pending recipients in rate-limited batches, updating
//   counts as it goes. No external cron dependency.

import {
  getCampaign,
  listCampaigns,
  createCampaign,
  updateCampaignStatus,
  setCampaignCounts,
  enqueueSegment,
  getPendingBatch,
  getLeadByEmail,
  markQueueSent,
  markQueueFailed,
  skipPending,
  resetFailedToPending,
} from '../db.js';
import { sendTemplateEmail } from './email-sender.js';
import { createTrackingRecord } from './email-tracking.js';

// Whitelist of segmentable columns (defense against SQL injection — only these
// keys may become SQL, and all VALUES are bound parameters).
const SEGMENT_COLUMNS = {
  zodiac_sign: 'zodiac_sign',
  gender: 'gender',
  civil_status: 'civil_status',
  source: 'source',
  utm_source: 'utm_source',
  utm_medium: 'utm_medium',
  utm_campaign: 'utm_campaign',
};

const BATCH_SIZE = Number(process.env.EMAIL_BATCH_SIZE || 50);
const BATCH_DELAY_MS = Number(process.env.EMAIL_BATCH_DELAY_MS || 1500);
const TICK_MS = Number(process.env.EMAIL_SCHEDULER_TICK_MS || 15000);
const DEFAULT_SEND_RATE_MS = Number(process.env.EMAIL_SEND_INTERVAL_MS || 250);

let timer = null;
let running = false;

/**
 * Build a parameterized WHERE clause from a segment object.
 * Supported keys:
 *   zodiac_sign, gender, civil_status, source, utm_source, utm_medium, utm_campaign
 *     -> exact match (string)
 *   min_age, max_age -> derived from birth_year (integer)
 *   created_since    -> ISO date string (leads created_at >= value)
 * Unknown keys are ignored. Returns { where, params }.
 */
export function buildSegmentWhere(segment = {}) {
  const clauses = [];
  const params = [];
  let n = 1;

  for (const key of Object.keys(segment)) {
    const col = SEGMENT_COLUMNS[key];
    const val = segment[key];
    if (!col || val === undefined || val === null || val === '') continue;

    if (['zodiac_sign', 'gender', 'civil_status', 'source', 'utm_source', 'utm_medium', 'utm_campaign'].includes(key)) {
      clauses.push(`${col} = $${n++}`);
      params.push(String(val));
    }
  }

  if (segment.min_age !== undefined && segment.min_age !== null && segment.min_age !== '') {
    // age >= min_age  => birth_year <= currentYear - min_age
    clauses.push(`birth_year <= $${n++}`);
    params.push(String(new Date().getFullYear() - Number(segment.min_age)));
  }
  if (segment.max_age !== undefined && segment.max_age !== null && segment.max_age !== '') {
    clauses.push(`birth_year >= $${n++}`);
    params.push(String(new Date().getFullYear() - Number(segment.max_age)));
  }
  if (segment.created_since) {
    clauses.push(`created_at >= $${n++}`);
    params.push(String(segment.created_since));
  }

  const where = clauses.length ? clauses.join(' AND ') : 'TRUE';
  return { where, params };
}

/**
 * Create a campaign and enqueue matching recipients.
 * @returns the campaign row + enqueued count
 */
export async function createAndEnqueueCampaign({ name, template, segment = {}, vars = {} }) {
  if (!name || !template) {
    throw new Error('name and template are required');
  }
  const { where, params } = buildSegmentWhere(segment);
  const campaign = await createCampaign({ name, template, segment, vars });
  const enqueued = await enqueueSegment(campaign.id, where, params);
  await updateCampaignStatus(campaign.id, 'running');
  return { campaign, enqueued };
}

/**
 * Process one campaign: send up to BATCH_SIZE pending recipients.
 * Returns counts of what happened this tick.
 */
async function processCampaign(campaign) {
  const batch = await getPendingBatch(campaign.id, BATCH_SIZE);
  if (batch.length === 0) {
    // Nothing left -> mark done.
    await updateCampaignStatus(campaign.id, 'done');
    return { campaignId: campaign.id, sent: 0, failed: 0, done: true };
  }

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      const lead = await getLeadByEmail(row.lead_email);
      const result = await sendTemplateEmail({
        email: row.lead_email,
        template: campaign.template,
        lead: lead || { email: row.lead_email },
        vars: campaign.vars || {},
        tags: [campaign.template, `campaign_${campaign.id}`],
        params: { campaign_id: String(campaign.id) },
      });
      await markQueueSent(row.id, result.trackId);
      // Persist a tracking record so opens/clicks can be correlated later.
      await createTrackingRecord(result.trackId, row.lead_email, campaign.template, campaign.id).catch(() => {});
      sent++;
    } catch (err) {
      await markQueueFailed(row.id, err.message);
      failed++;
      console.error(`[campaign:${campaign.id}] send failed for ${row.lead_email}:`, err.message);
    }
    // Pace individual sends to stay under Brevo rate limits.
    await new Promise((r) => setTimeout(r, DEFAULT_SEND_RATE_MS));
  }

  // Refresh totals.
  const fresh = await getCampaign(campaign.id);
  if (fresh) {
    await setCampaignCounts(campaign.id, fresh.sent + sent, fresh.failed + failed);
  }
  return { campaignId: campaign.id, sent, failed, done: false };
}

async function tick() {
  if (running) return; // guard against overlapping ticks
  running = true;
  try {
    const campaigns = await listCampaigns();
    const active = campaigns.filter((c) => c.status === 'running' || c.status === 'queued');
    for (const c of active) {
      try {
        const res = await processCampaign(c);
        if (res.done) {
          console.log(`[campaign:${c.id}] finished (${c.name})`);
        } else {
          console.log(`[campaign:${c.id}] tick sent=${res.sent} failed=${res.failed}`);
        }
      } catch (err) {
        console.error(`[campaign:${c.id}] tick error`, err);
      }
      // Small gap between campaigns to avoid hammering the API.
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  } catch (err) {
    console.error('[scheduler] tick error', err);
  } finally {
    running = false;
  }
}

export function startEmailScheduler() {
  if (timer) return;
  console.log(`[scheduler] email campaigns scheduler started (tick=${TICK_MS}ms, batch=${BATCH_SIZE})`);
  // Kick one immediately, then on interval.
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopEmailScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[scheduler] email campaigns scheduler stopped');
  }
}

// ----------------------------------------------------------------- Controls

export async function pauseCampaign(id) {
  return updateCampaignStatus(id, 'paused');
}

export async function resumeCampaign(id) {
  return updateCampaignStatus(id, 'running');
}

export async function cancelCampaign(id) {
  await skipPending(id); // pending -> skipped (won't be sent)
  return updateCampaignStatus(id, 'cancelled');
}

export async function retryFailed(id) {
  const n = await resetFailedToPending(id); // failed -> pending (re-enqueue)
  // If it was done/cancelled, flip back to running so the scheduler picks it up.
  const c = await getCampaign(id);
  if (c && (c.status === 'done' || c.status === 'cancelled' || c.status === 'paused')) {
    await updateCampaignStatus(id, 'running');
  }
  return { reenqueued: n };
}
