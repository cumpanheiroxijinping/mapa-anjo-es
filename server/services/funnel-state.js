// Funnel state machine (spec §6). Centralized transition logic.
//
// applyEvent(stateRow, event) -> {
//   statePatch,            // scalar/ts/json fields to merge into contact_states
//   tagsToAdd, tagsToRemove,
//   listsToAdd, listsToRemove,
//   automationsToCancel,   // automation keys whose pending sends must be cancelled
//   automationsToTrigger,  // automation keys to start (guarded by caller)
// }
//
// The caller (event route / postback / automation engine) is responsible for
// persisting statePatch via updateContactState and for starting/stopping
// automations through the DB helpers. This module is pure logic.

const PRIORITY = {
  K: 1, // refund / chargeback / support (highest)
  G: 2, // payment failed
  I: 3, // purchase confirmed / onboarding
  F: 4, // checkout abandoned
  E: 5, // offer reached no checkout
  D: 6, // vsl2 no offer
  C: 7, // lead captured no vsl2
  A: 8, // quiz abandoned (lowest)
  // J (upsells) inherits I's priority context; handled explicitly by caller.
};

export function automationPriority(key) {
  return PRIORITY[key] ?? 8;
}

function setMainProductStatus(out, status) {
  out.statePatch.main_product_status = status;
}

/**
 * Compute the state transition for an event. Pure: does not touch the DB.
 * @param {object|null} stateRow - current contact_states row (may be null)
 * @param {object} event - { event_name, email, metadata, occurred_at }
 */
export function applyEvent(stateRow, event) {
  const name = (event.event_name || '').toString();
  const meta = event.metadata || {};
  const nowIso = new Date().toISOString();

  const out = {
    statePatch: {},
    tagsToAdd: [],
    tagsToRemove: [],
    listsToAdd: [],
    listsToRemove: [],
    automationsToCancel: [],
    automationsToTrigger: [],
  };

  // Always bump last_activity.
  out.statePatch.last_activity_at = event.occurred_at || nowIso;

  switch (name) {
    // ---- Quiz / capture -------------------------------------------------
    case 'quiz_progress':
      if (meta.step != null) out.statePatch.quiz_step_reached = Number(meta.step);
      if (!stateRow || stateRow.funnel_stage === 'QUIZ_NEW') {
        out.statePatch.funnel_stage = 'QUIZ_ACTIVE';
      }
      break;

    case 'quiz_completed':
      out.statePatch.funnel_stage = 'QUIZ_COMPLETED_NO_EMAIL';
      out.statePatch.quiz_completed_at = event.occurred_at || nowIso;
      out.tagsToAdd.push('stage:quiz_completed');
      break;

    case 'email_submitted':
    case 'lead_conversion':
      out.statePatch.funnel_stage = 'LEAD_CAPTURED_VSL1';
      out.tagsToAdd.push('stage:email_captured');
      out.listsToAdd.push('LEADS_VSL1');
      if (!out.statePatch.consent_email_at) {
        // Treat email submission as consent for marketing automation.
        out.statePatch.consent_email_at = event.occurred_at || nowIso;
      }
      break;

    // ---- VSL2 -----------------------------------------------------------
    case 'vsl2_started':
    case 'vsl2_25':
      out.statePatch.funnel_stage = 'VSL2_ENGAGED';
      out.tagsToAdd.push('stage:vsl2_started', 'stage:vsl2_engaged');
      out.listsToAdd.push('LEADS_VSL2');
      out.automationsToCancel.push('C'); // lead captured but now watched VSL2
      break;

    case 'vsl2_offer_reached':
    case 'vsl2_50':
    case 'vsl2_75':
      out.statePatch.funnel_stage = 'OFFER_REACHED';
      out.tagsToAdd.push('stage:offer_reached');
      out.listsToAdd.push('LEADS_OFFER');
      out.automationsToCancel.push('D'); // vsl2 no offer resolved
      break;

    // ---- Checkout -------------------------------------------------------
    case 'checkout_redirected':
    case 'checkout_started':
      out.statePatch.funnel_stage = 'CHECKOUT_STARTED';
      out.statePatch.payment_status = 'initiated';
      out.tagsToAdd.push('stage:checkout_clicked', 'stage:checkout_started');
      out.listsToAdd.push('CHECKOUT_PROSPECTS');
      out.automationsToCancel.push('E'); // offer reached but now in checkout
      out.automationsToTrigger.push('F'); // start checkout recovery
      break;

    case 'checkout_form_completed':
      out.statePatch.payment_status = 'initiated';
      break;

    case 'payment_pending':
      out.statePatch.funnel_stage = 'PAYMENT_PENDING';
      out.statePatch.payment_status = 'pending';
      setMainProductStatus(out, 'pending');
      out.tagsToAdd.push('stage:payment_pending');
      out.listsToAdd.push('PAYMENT_PENDING');
      out.automationsToCancel.push('F'); // do not send checkout recovery while pending
      out.automationsToTrigger.push('H');
      break;

    case 'payment_failed':
      out.statePatch.funnel_stage = 'PAYMENT_FAILED';
      out.statePatch.payment_status = 'failed';
      setMainProductStatus(out, 'none');
      out.tagsToAdd.push('stage:payment_failed');
      out.listsToAdd.push('PAYMENT_FAILED');
      out.automationsToTrigger.push('G');
      break;

    case 'checkout_abandoned':
      out.statePatch.funnel_stage = 'CHECKOUT_NO_DATA';
      out.automationsToTrigger.push('F');
      break;

    // ---- Purchase / upsell ---------------------------------------------
    case 'purchase_completed': {
      out.statePatch.funnel_stage = 'UPSELL_ELIGIBLE';
      out.statePatch.main_product_status = 'paid';
      out.statePatch.payment_status = 'paid';
      out.statePatch.purchase_at = event.occurred_at || nowIso;
      if (meta.order_id) out.statePatch.order_id = String(meta.order_id);
      if (meta.offer_id) out.statePatch.offer_id = String(meta.offer_id);
      if (meta.payment_method) out.statePatch.payment_method = String(meta.payment_method);
      if (meta.amount != null) out.statePatch.main_product_price = Number(meta.amount);
      if (meta.currency) out.statePatch.main_product_currency = String(meta.currency);
      out.tagsToAdd.push('stage:purchased_main');
      out.listsToAdd.push('BUYERS_MAIN_PRODUCT');
      out.listsToRemove.push('CHECKOUT_PROSPECTS', 'PAYMENT_FAILED', 'PAYMENT_PENDING');
      // Cancel ALL recovery automations (spec §8): F, E, D, C, A, G, H.
      out.automationsToCancel.push('F', 'E', 'D', 'C', 'A', 'G', 'H');
      out.statePatch.suppression_recovery = true;
      // Trigger onboarding + upsell sequence.
      out.automationsToTrigger.push('I', 'J');
      break;
    }

    case 'upsell_completed': {
      out.statePatch.funnel_stage = 'UPSELL_PURCHASED';
      out.statePatch.upsell_status = 'paid';
      out.statePatch.upsell_purchase_at = event.occurred_at || nowIso;
      const offer = meta.offer_id || 'up1';
      out.tagsToAdd.push('stage:upsell_purchased', `product:${offer}`);
      out.listsToAdd.push('BUYERS_UPSELL');
      break;
    }

    case 'upsell_declined':
      out.statePatch.upsell_status = 'declined';
      out.tagsToAdd.push('stage:upsell_declined');
      break;

    // ---- Refund / chargeback / opt-out ----------------------------------
    case 'purchase_refunded':
      out.statePatch.funnel_stage = 'REFUNDED';
      out.statePatch.main_product_status = 'refunded';
      out.statePatch.refund_at = event.occurred_at || nowIso;
      out.statePatch.suppression_all_marketing = true;
      out.tagsToAdd.push('stage:refunded', 'suppression:all_marketing');
      out.listsToAdd.push('REFUNDS');
      out.automationsToCancel.push('F', 'E', 'D', 'C', 'A', 'G', 'I', 'J', 'H');
      out.automationsToTrigger.push('K');
      break;

    case 'chargeback_opened':
      out.statePatch.funnel_stage = 'REFUNDED';
      out.statePatch.main_product_status = 'chargeback';
      out.statePatch.chargeback_opened = true;
      out.statePatch.suppression_all_marketing = true;
      out.tagsToAdd.push('suppression:all_marketing', 'stage:refunded');
      out.listsToAdd.push('CHARGEBACKS');
      out.automationsToCancel.push('F', 'E', 'D', 'C', 'A', 'G', 'I', 'J', 'H');
      out.automationsToTrigger.push('K');
      break;

    case 'unsubscribe':
      out.statePatch.funnel_stage = 'UNSUBSCRIBED';
      out.statePatch.unsubscribe_at = event.occurred_at || nowIso;
      out.statePatch.suppression_all_marketing = true;
      out.tagsToAdd.push('stage:unsubscribed', 'suppression:all_marketing');
      out.automationsToCancel.push('F', 'E', 'D', 'C', 'A', 'G', 'H');
      break;

    case 'support_requested':
      out.statePatch.support_status = 'issue';
      out.tagsToAdd.push('support:requested');
      out.automationsToCancel.push('F', 'E', 'D', 'C', 'A', 'G');
      break;

    case 'hard_bounce':
      out.statePatch.hard_bounce = true;
      out.statePatch.suppression_all_marketing = true;
      break;

    default:
      // Unknown / informational events only bump last_activity and maybe tags.
      if (name === 'quiz_started') {
        if (!stateRow || stateRow.funnel_stage === 'QUIZ_NEW') {
          out.statePatch.funnel_stage = 'QUIZ_ACTIVE';
        }
        out.tagsToAdd.push('stage:quiz_started');
      }
      if (name === 'vsl1_to_vsl2') {
        out.listsToAdd.push('LEADS_VSL2');
      }
      break;
  }

  return out;
}
