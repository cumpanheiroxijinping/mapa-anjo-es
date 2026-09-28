// Email open/click tracking service (ported + adapted from ZAPSPY).
//
// Self-hosted tracking: a 1x1 transparent pixel served at GET /t/o/:trackId
// records an "open", and link redirects at GET /t/c/:trackId record a "click"
// before 302-redirecting to the original URL. Brevo webhook events
// (delivered/bounce/unsubscribed/complaint) are also recorded via recordEvent.
//
// NOTE: this is NOT Meta/Facebook tracking — the pixel lives on our own server
// and measures email engagement only. No third-party ad pixels are involved.

import { getPool } from '../db.js';

// Pre-computed 1x1 transparent PNG (43 bytes).
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export function getTrackingPixel() {
  return TRACKING_PIXEL;
}

/**
 * Create a tracking record for a sent email. track_id is generated upstream
 * (email-sender.js) as "eml_...". Idempotent on conflict.
 */
export async function createTrackingRecord(trackId, email, template, campaignId = null) {
  const p = getPool();
  await p.query(
    `INSERT INTO email_tracking (track_id, email, template, campaign_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (track_id) DO NOTHING`,
    [trackId, email, template, campaignId]
  );
  return trackId;
}

/**
 * Generic event recorder. Returns false if the track_id is unknown.
 */
export async function recordEvent(trackId, eventType, { url = '', ip = '', userAgent = '' } = {}) {
  if (!trackId) return false;
  try {
    const p = getPool();
    const check = await p.query('SELECT 1 FROM email_tracking WHERE track_id = $1', [trackId]);
    if (check.rows.length === 0) return false;
    await p.query(
      `INSERT INTO email_tracking_events (track_id, event_type, url, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [trackId, eventType, url || null, ip || null, userAgent || null]
    );
    return true;
  } catch (err) {
    console.error(`[tracking] record ${eventType} error`, err.message);
    return false;
  }
}

export async function recordOpen(trackId, ip, userAgent) {
  return recordEvent(trackId, 'open', { ip, userAgent });
}

export async function recordClick(trackId, url, ip, userAgent) {
  return recordEvent(trackId, 'click', { url, ip, userAgent });
}

function pct(num, den) {
  return den > 0 ? ((num / den) * 100).toFixed(1) : '0.0';
}

/**
 * Summary metrics across all campaigns/templates.
 */
export async function getSummaryMetrics() {
  try {
    const p = getPool();
    const res = await p.query(`
      SELECT
        COUNT(DISTINCT t.track_id)                                        AS total_sent,
        COUNT(DISTINCT t.email)                                           AS unique_contacts,
        COUNT(DISTINCT CASE WHEN e.event_type = 'delivered'    THEN t.track_id END) AS unique_delivered,
        COUNT(DISTINCT CASE WHEN e.event_type IN ('hard_bounce','soft_bounce') THEN t.track_id END) AS unique_bounced,
        COUNT(DISTINCT CASE WHEN e.event_type = 'unsubscribed' THEN t.track_id END) AS unique_unsubscribed,
        COUNT(DISTINCT CASE WHEN e.event_type = 'complaint'    THEN t.track_id END) AS unique_complaints,
        COUNT(DISTINCT CASE WHEN e.event_type = 'open'         THEN t.track_id END) AS unique_opens,
        COUNT(DISTINCT CASE WHEN e.event_type = 'click'        THEN t.track_id END) AS unique_clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'open'  THEN t.email END) AS contacts_opened,
        COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN t.email END) AS contacts_clicked
      FROM email_tracking t
      LEFT JOIN email_tracking_events e ON t.track_id = e.track_id
    `);
    const r = res.rows[0] || {};
    const sent = parseInt(r.total_sent || 0, 10);
    return {
      total_sent: sent,
      unique_contacts: parseInt(r.unique_contacts || 0, 10),
      unique_delivered: parseInt(r.unique_delivered || 0, 10),
      unique_bounced: parseInt(r.unique_bounced || 0, 10),
      unique_unsubscribed: parseInt(r.unique_unsubscribed || 0, 10),
      unique_complaints: parseInt(r.unique_complaints || 0, 10),
      unique_opens: parseInt(r.unique_opens || 0, 10),
      unique_clicks: parseInt(r.unique_clicks || 0, 10),
      contacts_opened: parseInt(r.contacts_opened || 0, 10),
      contacts_clicked: parseInt(r.contacts_clicked || 0, 10),
      open_rate: pct(r.unique_opens, sent),
      click_rate: pct(r.unique_clicks, sent),
      delivered_rate: pct(r.unique_delivered, sent),
      bounce_rate: pct(r.unique_bounced, sent),
      unsubscribe_rate: pct(r.unique_unsubscribed, sent),
      complaint_rate: pct(r.unique_complaints, sent),
    };
  } catch (err) {
    console.error('[tracking] summary error', err.message);
    return null;
  }
}

/**
 * Per-campaign metrics (joined with campaign metadata).
 */
export async function getMetricsByCampaign() {
  try {
    const p = getPool();
    const res = await p.query(`
      SELECT
        c.id AS campaign_id, c.name, c.template, c.status,
        c.sent AS queued_sent, c.failed AS queued_failed,
        COUNT(DISTINCT t.track_id)                                       AS total_sent,
        COUNT(DISTINCT CASE WHEN e.event_type = 'delivered'    THEN t.track_id END) AS unique_delivered,
        COUNT(DISTINCT CASE WHEN e.event_type IN ('hard_bounce','soft_bounce') THEN t.track_id END) AS unique_bounced,
        COUNT(DISTINCT CASE WHEN e.event_type = 'unsubscribed' THEN t.track_id END) AS unique_unsubscribed,
        COUNT(DISTINCT CASE WHEN e.event_type = 'open'         THEN t.track_id END) AS unique_opens,
        COUNT(DISTINCT CASE WHEN e.event_type = 'click'        THEN t.track_id END) AS unique_clicks
      FROM email_campaigns c
      LEFT JOIN email_tracking t ON t.campaign_id = c.id
      LEFT JOIN email_tracking_events e ON e.track_id = t.track_id
      GROUP BY c.id, c.name, c.template, c.status, c.sent, c.failed
      ORDER BY c.created_at DESC
    `);
    return res.rows.map((r) => {
      const sent = parseInt(r.total_sent || 0, 10);
      return {
        campaign_id: r.campaign_id,
        name: r.name,
        template: r.template,
        status: r.status,
        queued_sent: parseInt(r.queued_sent || 0, 10),
        queued_failed: parseInt(r.queued_failed || 0, 10),
        total_sent: sent,
        unique_delivered: parseInt(r.unique_delivered || 0, 10),
        unique_bounced: parseInt(r.unique_bounced || 0, 10),
        unique_unsubscribed: parseInt(r.unique_unsubscribed || 0, 10),
        unique_opens: parseInt(r.unique_opens || 0, 10),
        unique_clicks: parseInt(r.unique_clicks || 0, 10),
        open_rate: pct(r.unique_opens, sent),
        click_rate: pct(r.unique_clicks, sent),
        bounce_rate: pct(r.unique_bounced, sent),
        unsubscribe_rate: pct(r.unique_unsubscribed, sent),
      };
    });
  } catch (err) {
    console.error('[tracking] by-campaign error', err.message);
    return [];
  }
}

/**
 * Recent events for the live feed / debugging.
 */
export async function getRecentEvents(limit = 50) {
  try {
    const p = getPool();
    const res = await p.query(
      `SELECT e.event_type, e.url, e.ip_address, e.created_at,
              t.email, t.template, t.campaign_id
       FROM email_tracking_events e
       JOIN email_tracking t ON e.track_id = t.track_id
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  } catch (err) {
    console.error('[tracking] recent events error', err.message);
    return [];
  }
}

/**
 * Daily sent/open/click series for charts.
 */
export async function getDailyMetrics(days = 30) {
  try {
    const p = getPool();
    const res = await p.query(
      `SELECT DATE(t.created_at) AS date,
              COUNT(DISTINCT t.track_id) AS sent,
              COUNT(DISTINCT CASE WHEN e.event_type = 'open'  THEN t.track_id END) AS opens,
              COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN t.track_id END) AS clicks
       FROM email_tracking t
       LEFT JOIN email_tracking_events e ON e.track_id = t.track_id
       WHERE t.created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY DATE(t.created_at)
       ORDER BY DATE(t.created_at) DESC`,
      [String(days)]
    );
    return res.rows;
  } catch (err) {
    console.error('[tracking] daily metrics error', err.message);
    return [];
  }
}
