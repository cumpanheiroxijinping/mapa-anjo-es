// Automation engine + event-driven timer scheduler (spec §9/§10).
//
// Responsibilities:
//  - Map funnel events -> automation entries (AUTOMATION_TRIGGERS).
//  - Build scheduled sends (pending_sends) from each automation's SCHEDULES.
//  - Run a tick that drains due pending_sends, revalidating exclusions,
//    12h gap, priority and silent-hours before each send.
//
// Reuses sendTemplateEmail + createTrackingRecord from existing modules.

import {
  getContactState,
  updateContactState,
  upsertContactState,
  upsertAutomationInstance,
  getActiveInstances,
  endAutomationInstance,
  insertPendingSend,
  getDuePendingSends,
  markPendingSent,
  markPendingFailed,
  cancelPendingByEmail,
  insertFunnelEvent,
  claimBulkJobs,
  setBulkJobResult,
} from '../db.js';
import { applyEvent, automationPriority } from './funnel-state.js';
import { sendTemplateEmail } from './email-sender.js';
import { createTrackingRecord } from './email-tracking.js';
import { computeSendAt } from '../util/timezone.js';

// ----------------------------------------------------------------- Triggers

// Which automations an event can START. Guards are checked by the caller
// (evaluateTriggers) using current state. This is the entry map (spec §10).
const AUTOMATION_TRIGGERS = {
  quiz_progress: ['A'],
  quiz_started: ['A'],
  quiz_completed: ['B'],
  email_submitted: ['C'],
  lead_conversion: ['C'],
  vsl2_started: ['D'],
  vsl2_25: ['D'],
  vsl2_offer_reached: ['E'],
  vsl2_50: ['E'],
  vsl2_75: ['E'],
  checkout_redirected: ['F'],
  checkout_started: ['F'],
  checkout_abandoned: ['F'],
  payment_failed: ['G'],
  payment_pending: ['H'],
  purchase_completed: ['I', 'J'],
  upsell_completed: ['J'],
  purchase_refunded: ['K'],
  chargeback_opened: ['K'],
};

// --------------------------------------------------------------- Schedules
// Each entry: { step_key, delayMinutes, template, priority }.
// delayMinutes is measured from the triggering event's occurred_at.
// Priority follows spec §9 (1 highest). Promo automations are 2..8; I/J/K
// promotional-onboarding use 3; K (refund/support) is 1 (always allowed).

const RECOVERY_CHALLENGES = ['love', 'finance', 'health', 'happiness'];

const SCHEDULES = {
  A: [
    { step_key: 'A_t30m', delayMinutes: 30, template: 'quiz_abandon_1', priority: 8 },
    { step_key: 'A_t24h', delayMinutes: 1440, template: 'quiz_abandon_2', priority: 8 },
  ],
  C: [
    { step_key: 'C_t15m', delayMinutes: 15, template: 'lead_vsl2_1', priority: 7 },
    { step_key: 'C_t8h', delayMinutes: 480, template: 'lead_vsl2_2', priority: 7 },
    { step_key: 'C_t24h', delayMinutes: 1440, template: 'lead_vsl2_3', priority: 7 },
    { step_key: 'C_t48h', delayMinutes: 2880, template: 'lead_vsl2_4', priority: 7 },
  ],
  D: [
    { step_key: 'D_t1h', delayMinutes: 60, template: 'vsl2_nooffer_1', priority: 6 },
    { step_key: 'D_t12h', delayMinutes: 720, template: 'vsl2_nooffer_2', priority: 6 },
    { step_key: 'D_t36h', delayMinutes: 2160, template: 'vsl2_nooffer_3', priority: 6 },
  ],
  E: [
    { step_key: 'E_t2h', delayMinutes: 120, template: 'offer_nocheckout_1', priority: 5 },
    { step_key: 'E_t24h', delayMinutes: 1440, template: 'offer_nocheckout_2', priority: 5 },
    { step_key: 'E_t48h', delayMinutes: 2880, template: 'offer_nocheckout_3', priority: 5 },
    { step_key: 'E_t72h', delayMinutes: 4320, template: 'offer_nocheckout_4', priority: 5 },
    { step_key: 'E_t5d', delayMinutes: 7200, template: 'offer_nocheckout_5', priority: 5 },
  ],
  F: [
    { step_key: 'F_t30m', delayMinutes: 30, template: 'checkout_recovery_1', priority: 4 },
    { step_key: 'F_t6h', delayMinutes: 360, template: 'checkout_recovery_2', priority: 4 },
    { step_key: 'F_t24h', delayMinutes: 1440, template: 'checkout_recovery_3', priority: 4 },
    { step_key: 'F_t48h', delayMinutes: 2880, template: 'checkout_recovery_4', priority: 4 },
    { step_key: 'F_t72h', delayMinutes: 4320, template: 'checkout_recovery_5', priority: 4 },
    { step_key: 'F_t5d', delayMinutes: 7200, template: 'checkout_recovery_6', priority: 4 },
    { step_key: 'F_t7d', delayMinutes: 10080, template: 'checkout_recovery_7', priority: 4 },
  ],
  G: [
    { step_key: 'G_t15m', delayMinutes: 15, template: 'payment_failed_1', priority: 2 },
    { step_key: 'G_t6h', delayMinutes: 360, template: 'payment_failed_2', priority: 2 },
    { step_key: 'G_t24h', delayMinutes: 1440, template: 'payment_failed_3', priority: 2 },
    { step_key: 'G_t48h', delayMinutes: 2880, template: 'payment_failed_4', priority: 2 },
    { step_key: 'G_t72h', delayMinutes: 4320, template: 'payment_failed_5', priority: 2 },
  ],
  H: [
    { step_key: 'H_t0', delayMinutes: 0, template: 'payment_pending_1', priority: 2 },
    { step_key: 'H_expire', delayMinutes: 2880, template: 'payment_pending_expire', priority: 2 },
  ],
  I: [
    { step_key: 'I_t0', delayMinutes: 0, template: 'onboarding_1', priority: 3 },
    { step_key: 'I_t1h', delayMinutes: 60, template: 'onboarding_2', priority: 3 },
    { step_key: 'I_t24h', delayMinutes: 1440, template: 'onboarding_3', priority: 3 },
    { step_key: 'I_t3d', delayMinutes: 4320, template: 'onboarding_4', priority: 3 },
    { step_key: 'I_t7d', delayMinutes: 10080, template: 'onboarding_5', priority: 3 },
  ],
  J: [
    // Upsell sequence driven by upsell_completed/declined gating in caller.
    { step_key: 'J_up1', delayMinutes: 0, template: 'upsell_up1_1', priority: 3 },
    { step_key: 'J_up2', delayMinutes: 2880, template: 'upsell_up2_1', priority: 3 },
    { step_key: 'J_up3', delayMinutes: 5760, template: 'upsell_up3_1', priority: 3 },
  ],
  K: [
    { step_key: 'K_t0', delayMinutes: 0, template: 'refund_support_1', priority: 1 },
  ],
};

// ----------------------------------------------------- Trigger evaluation

/**
 * Given an event, create automation instances + scheduled sends for any
 * automation that should start. Honors the active-instance guard (no dupes)
 * and the silent-window roll. Does NOT cancel automations (that is handled by
 * applyEvent side-effects in the caller).
 *
 * @returns {Promise<{started: string[]}>}
 */
export async function evaluateTriggers(event) {
  const email = (event.email || '').toString().toLowerCase();
  if (!email) return { started: [] };

  const state = (await getContactState(email)) || (await upsertContactState(email)) || {};
  const triggers = AUTOMATION_TRIGGERS[event.event_name] || [];
  const started = [];

  for (const key of triggers) {
    // Active-instance guard.
    const active = await getActiveInstances(email);
    if (active.some((a) => a.automation_key === key)) continue;
    if (key === 'J') {
      // Upsell gating: only start if purchase confirmed and not refunded.
      if (state.main_product_status !== 'paid') continue;
    }
    if (key === 'B') {
      // Quiz complete no-email: no email -> nothing to send, skip scheduling.
      if (!email) continue;
    }

    const { created } = await upsertAutomationInstance(email, key, event.occurred_at || new Date().toISOString());
    if (!created) continue;

    const tz = state.timezone || 'America/Mexico_City';
    const schedule = SCHEDULES[key] || [];
    for (const step of schedule) {
      // For recovery automations (C/D/E/F/G), expand per challenge if the
      // template has challenge variants available; otherwise use base name.
      const template = resolveTemplate(step.template, state.primary_challenge);
      const sendAt = computeSendAt(event.occurred_at || new Date().toISOString(), step.delayMinutes, tz);
      await insertPendingSend({
        email,
        automationKey: key,
        stepKey: step.step_key,
        template,
        vars: { challenge: state.primary_challenge || '' },
        priority: step.priority,
        sendAt,
      });
    }
    started.push(key);
  }

  return { started };
}

/**
 * Resolve a template name to its challenge variant if available.
 * Convention: base "checkout_recovery_1" + challenge "love" -> file
 * "checkout_recovery_1_love.txt". We don't verify existence here (the sender
 * will fall back gracefully); caller may later validate.
 */
function resolveTemplate(base, challenge) {
  if (!challenge || !RECOVERY_CHALLENGES.includes(challenge)) return base;
  return `${base}_${challenge}`;
}

// ----------------------------------------------------------- Apply + persist

/**
 * Full ingest of a normalized event from any source (frontend / postback):
 *  1. insert funnel event (idempotent)
 *  2. upsert contact state
 *  3. applyEvent -> patch + side effects
 *  4. persist patch (tags/lists merged)
 *  5. cancel lower/higher-priority pending sends per spec §9
 *  6. evaluateTriggers -> schedule sends
 *
 * `event` must include: event_name, event_id (for frontend), email,
 * occurred_at, metadata. For postback-derived events a synthetic event_id is
 * generated upstream.
 */
export async function ingestEvent(event) {
  // 1. funnel event (idempotent)
  const { inserted } = await insertFunnelEvent(event);
  // Even if duplicate, still ensure state exists (idempotent upsert).
  const state = (await getContactState(event.email)) || (await upsertContactState(event.email)) || {};

  // 2/3. compute transition
  const result = applyEvent(state, event);

  // 4. persist patch
  if (Object.keys(result.statePatch).length || result.tagsToAdd.length ||
      result.tagsToRemove.length || result.listsToAdd.length || result.listsToRemove.length) {
    await updateContactState(event.email, {
      ...result.statePatch,
      tagsToAdd: result.tagsToAdd,
      tagsToRemove: result.tagsToRemove,
      listsToAdd: result.listsToAdd,
      listsToRemove: result.listsToRemove,
    });
  }

  // 5. cancel automations requested by the transition (spec §8/§9).
  for (const key of result.automationsToCancel) {
    const cancelled = await cancelPendingByEmail(event.email, { onlyAutomationKey: key });
    if (cancelled > 0) {
      // end any active instance of that key
      const act = await getActiveInstances(event.email);
      const inst = act.find((a) => a.automation_key === key);
      if (inst) await endAutomationInstance(inst.id, 'cancelled');
    }
  }

  // 6. start triggered automations
  const { started } = await evaluateTriggers(event);

  return { inserted, started, result };
}

// ------------------------------------------------------------------ Scheduler

const TICK_MS = Number(process.env.AUTOMATION_TICK_MS || 15000);
const SEND_INTERVAL_MS = Number(process.env.EMAIL_SEND_INTERVAL_MS || 250);
const BATCH_SIZE = Number(process.env.AUTOMATION_BATCH_SIZE || 50);
const GAP_MS = 12 * 60 * 60 * 1000; // 12h (spec §9)

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    // Drain the persistent "Disparar" bulk queue first (cheap, no scheduling).
    await processBulkQueue();
    // Then drain due pending_sends (actual email sends).
    const due = await getDuePendingSends(BATCH_SIZE);
    for (const row of due) {
      try {
        await processPendingSend(row);
      } catch (err) {
        console.error(`[automation] tick error for pending ${row.id}:`, err.message);
      }
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    }
  } catch (err) {
    console.error('[automation] tick error', err);
  } finally {
    running = false;
  }
}

async function processPendingSend(row) {
  const email = row.email;
  const state = await getContactState(email);

  // --- Revalidate global exclusions (spec §8) -------------------------
  if (state) {
    const isRecoveryOrPromo = row.automation_key !== 'I' && row.automation_key !== 'J' && row.automation_key !== 'K';
    const excluded =
      (state.main_product_status === 'paid' && isRecoveryOrPromo) ||
      state.main_product_status === 'refunded' ||
      state.main_product_status === 'chargeback' ||
      state.unsubscribe_at != null ||
      state.suppression_all_marketing === true ||
      state.hard_bounce === true ||
      state.chargeback_opened === true;
    if (excluded) {
      await markPendingFailed(row.id, 'excluded_by_state');
      // move to cancelled to stop retries
      await cancelPendingByEmail(email, { onlyAutomationKey: row.automation_key });
      return;
    }

    // --- 12h gap (spec §9): promo priority > 2 waits ----------------
    if (row.priority > 2 && state.last_promo_email_at) {
      const since = new Date(state.last_promo_email_at).getTime();
      const wait = GAP_MS - (Date.now() - since);
      if (wait > 0) {
        // push send_at forward, keep pending (will be picked up after wait)
        await rescheduleSend(row.id, new Date(Date.now() + wait));
        return;
      }
    }

    // --- Priority cancellation (spec §9) -----------------------------
    const active = await getActiveInstances(email);
    const higherActive = active.some(
      (a) => a.automation_key !== row.automation_key &&
             automationPriority(a.automation_key) < row.priority
    );
    if (higherActive) {
      await cancelPendingByEmail(email, { onlyAutomationKey: row.automation_key });
      return;
    }
  }

  // --- Send ----------------------------------------------------------
  try {
    const vars = { ...(row.vars || {}), email };
    const result = await sendTemplateEmail({
      email,
      template: row.template,
      lead: state || { email },
      vars,
      tags: [row.automation_key, row.step_key],
      params: { automation_key: row.automation_key, step_key: row.step_key },
    });
    await createTrackingRecord(result.trackId, email, row.template, null).catch(() => {});
    await markPendingSent(row.id, result.trackId);
    if (row.priority > 2) {
      await updateContactState(email, { last_promo_email_at: new Date().toISOString() });
    }
  } catch (err) {
    await markPendingFailed(row.id, err.message);
  }
}

async function rescheduleSend(id, newSendAt) {
  const p = (await import('../db.js')).getPool();
  await p.query('UPDATE pending_sends SET send_at = $2 WHERE id = $1 AND status = $3', [id, newSendAt, 'pending']);
}

// ----------------------------------------------------- Bulk job (Disparar) queue
// Process persistent bulk_jobs items (enqueued by /api/monitor/trigger-event).
// Runs inside the same tick as pending_sends so a container restart mid-run
// resumes automatically (items left 'processing' for >10min are reclaimed).

const BULK_EVENT_MAP = {
  abandonment: { event_name: 'checkout_abandoned', key: 'F' },
  rejected: { event_name: 'payment_failed', key: 'G' },
  canceled: { event_name: 'payment_failed', key: 'G' },
};
const BULK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function processBulkItem(item) {
  const email = (item.email || '').toString().toLowerCase();
  try {
    if (item.mode === 'reapply') {
      const { event_name, key } = BULK_EVENT_MAP[item.event] || {};
      if (!event_name) throw new Error('unknown_event');
      const ts = Date.now();
      const active = await getActiveInstances(email);
      const inst = active.find((a) => a.automation_key === key);
      if (inst) {
        await endAutomationInstance(inst.id, 'cancelled');
        await cancelPendingByEmail(email, { onlyAutomationKey: key });
      }
      await ingestEvent({
        event_name,
        event_id: `monitor_reapply_${item.event}_${email}_${ts}`,
        email,
        funnel_name: process.env.FUNNEL_NAME || 'angel_guarda',
        occurred_at: new Date().toISOString(),
        page_url: '',
        utm: {},
        metadata: { source: 'monitor_reapply', ...(item.payload || {}) },
      });
      return 'done';
    }

    // mode === 'resend'
    if (!BULK_EMAIL_RE.test(email)) return 'done';
    const state = (await getContactState(email)) || { email };
    await sendTemplateEmail({
      email,
      template: item.template,
      lead: state,
      vars: { challenge: state.primary_challenge || '' },
      tags: ['monitor_resend', ...((item.payload?.tag && [item.payload.tag]) || [])],
      params: { monitor_resend: true },
    });
    return 'done';
  } catch (e) {
    console.error(`[automation] bulk item failed for ${email}:`, e.message);
    return 'error';
  }
}

async function processBulkQueue() {
  const claimed = await claimBulkJobs(BATCH_SIZE);
  for (const item of claimed) {
    const status = await processBulkItem(item);
    await setBulkJobResult(item.id, status, status === 'error' ? 'processing_failed' : null);
  }
}

export function startAutomationEngine() {
  if (timer) return;
  console.log(`[automation] engine started (tick=${TICK_MS}ms, batch=${BATCH_SIZE})`);
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopAutomationEngine() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[automation] engine stopped');
  }
}
