import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS leads (
  id              BIGSERIAL PRIMARY KEY,
  first_name      TEXT,
  email           TEXT NOT NULL,
  gender          TEXT,
  civil_status    TEXT,
  birth_day       TEXT,
  birth_year      TEXT,
  zodiac_sign     TEXT,
  life_challenge  TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  utm_prefix      TEXT,
  source          TEXT DEFAULT 'web',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
`;

const CREATE_EMAIL_TABLES = `
-- Email broadcast campaigns.
CREATE TABLE IF NOT EXISTS email_campaigns (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  template     TEXT NOT NULL,
  segment      JSONB NOT NULL DEFAULT '{}'::jsonb,
  vars         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | paused | failed
  total        INTEGER NOT NULL DEFAULT 0,
  sent         INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON email_campaigns(status);

-- Per-recipient send queue (deduped per campaign+email).
CREATE TABLE IF NOT EXISTS email_queue (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  BIGINT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  lead_email   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  track_id     TEXT,
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_queue_campaign_status ON email_queue(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_campaign_email
  ON email_queue(campaign_id, lead_email);
`;

const CREATE_TRACKING_TABLES = `
-- Email open/click tracking records (one per sent email, keyed by track_id).
CREATE TABLE IF NOT EXISTS email_tracking (
  track_id     TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  template     TEXT,
  campaign_id  BIGINT REFERENCES email_campaigns(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_email ON email_tracking(email);
CREATE INDEX IF NOT EXISTS idx_tracking_campaign ON email_tracking(campaign_id);

-- Individual tracking events (open/click/delivered/bounce/unsubscribed/complaint).
CREATE TABLE IF NOT EXISTS email_tracking_events (
  id           BIGSERIAL PRIMARY KEY,
  track_id     TEXT NOT NULL REFERENCES email_tracking(track_id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  url          TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_track_id ON email_tracking_events(track_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON email_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON email_tracking_events(created_at);
`;

export async function initDb() {
  const p = getPool();
  await p.query(CREATE_TABLE);
  // Remove pre-existing duplicate rows: for each email keep the most complete
  // record (the one with demographic data), then enforce email uniqueness.
  await p.query(`
    DELETE FROM leads
    WHERE id NOT IN (
      SELECT DISTINCT ON (email) id FROM leads
      ORDER BY email, (gender IS NOT NULL) DESC, id ASC
    );
  `);
  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_email ON leads(email);
  `);
  await p.query(CREATE_EMAIL_TABLES);
  await p.query(CREATE_TRACKING_TABLES);
  console.log('[db] leads + email tables ready');
}

export async function insertLead(lead) {
  const p = getPool();
  const q = `
    INSERT INTO leads
      (first_name, email, gender, civil_status, birth_day, birth_year,
       zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
       utm_term, utm_content, utm_prefix, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (email) DO UPDATE SET
      first_name     = COALESCE(leads.first_name, EXCLUDED.first_name),
      gender         = COALESCE(leads.gender, EXCLUDED.gender),
      civil_status   = COALESCE(leads.civil_status, EXCLUDED.civil_status),
      birth_day      = COALESCE(leads.birth_day, EXCLUDED.birth_day),
      birth_year     = COALESCE(leads.birth_year, EXCLUDED.birth_year),
      zodiac_sign    = COALESCE(leads.zodiac_sign, EXCLUDED.zodiac_sign),
      life_challenge = COALESCE(leads.life_challenge, EXCLUDED.life_challenge),
      utm_source     = COALESCE(leads.utm_source, EXCLUDED.utm_source),
      utm_medium     = COALESCE(leads.utm_medium, EXCLUDED.utm_medium),
      utm_campaign   = COALESCE(leads.utm_campaign, EXCLUDED.utm_campaign),
      utm_term       = COALESCE(leads.utm_term, EXCLUDED.utm_term),
      utm_content    = COALESCE(leads.utm_content, EXCLUDED.utm_content),
      utm_prefix     = COALESCE(leads.utm_prefix, EXCLUDED.utm_prefix),
      source         = COALESCE(leads.source, EXCLUDED.source)
    RETURNING id, created_at;
  `;
  const values = [
    lead.first_name ?? null,
    lead.email,
    lead.gender ?? null,
    lead.civil_status ?? null,
    lead.birth_day ?? null,
    lead.birth_year ?? null,
    lead.zodiac_sign ?? null,
    lead.life_challenge ?? null,
    lead.utm_source ?? null,
    lead.utm_medium ?? null,
    lead.utm_campaign ?? null,
    lead.utm_term ?? null,
    lead.utm_content ?? null,
    lead.utm_prefix ?? null,
    lead.source ?? 'web',
  ];
  const res = await p.query(q, values);
  return res.rows[0];
}

export async function getAllLeads() {
  const p = getPool();
  const res = await p.query('SELECT * FROM leads ORDER BY created_at DESC');
  return res.rows;
}

// ---------------------------------------------------------------- Campaigns

export async function createCampaign({ name, template, segment = {}, vars = {} }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO email_campaigns (name, template, segment, vars)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING *`,
    [name, template, JSON.stringify(segment), JSON.stringify(vars)]
  );
  return res.rows[0];
}

export async function getCampaign(id) {
  const p = getPool();
  const res = await p.query('SELECT * FROM email_campaigns WHERE id = $1', [id]);
  return res.rows[0] || null;
}

export async function listCampaigns() {
  const p = getPool();
  const res = await p.query(`
    SELECT c.*,
      (SELECT count(*) FROM email_queue q WHERE q.campaign_id = c.id) AS queued_total,
      (SELECT count(*) FROM email_queue q WHERE q.campaign_id = c.id AND q.status = 'sent') AS sent_count,
      (SELECT count(*) FROM email_queue q WHERE q.campaign_id = c.id AND q.status = 'failed') AS failed_count,
      (SELECT count(*) FROM email_queue q WHERE q.campaign_id = c.id AND q.status = 'pending') AS pending_count
    FROM email_campaigns c
    ORDER BY c.created_at DESC
  `);
  return res.rows;
}

export async function updateCampaignStatus(id, status) {
  const p = getPool();
  const finishedAt = status === 'done' || status === 'failed' ? 'now()' : 'NULL';
  const res = await p.query(
    `UPDATE email_campaigns SET status = $2, finished_at = ${finishedAt} WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return res.rows[0];
}

export async function setCampaignCounts(id, sent, failed) {
  const p = getPool();
  await p.query(
    'UPDATE email_campaigns SET sent = $2, failed = $3 WHERE id = $1',
    [id, sent, failed]
  );
}

// ---------------------------------------------------------------- Queue

/**
 * Enqueue leads matching a segment into a campaign's queue.
 * Uses a temp staging via SELECT … INSERT to avoid per-row round trips.
 * Returns the number of new recipients enqueued.
 */
export async function enqueueSegment(campaignId, whereClause, params) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO email_queue (campaign_id, lead_email, status)
     SELECT $1::bigint, LOWER(email), 'pending'
     FROM leads
     WHERE ${whereClause}
     ON CONFLICT (campaign_id, lead_email) DO NOTHING
     RETURNING lead_email`,
    [campaignId, ...params]
  );
  return res.rowCount;
}

export async function getPendingBatch(campaignId, limit) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, lead_email FROM email_queue
     WHERE campaign_id = $1 AND status = 'pending'
     ORDER BY id ASC
     LIMIT $2`,
    [campaignId, limit]
  );
  return res.rows;
}

export async function getLeadByEmail(email) {
  const p = getPool();
  const res = await p.query(
    `SELECT first_name, email, gender, civil_status, birth_day, birth_year,
            zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, utm_prefix
     FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  return res.rows[0] || null;
}

export async function markQueueSent(queueId, trackId) {
  const p = getPool();
  await p.query(
    `UPDATE email_queue SET status = 'sent', track_id = $2, sent_at = now(), attempts = attempts + 1
     WHERE id = $1`,
    [queueId, trackId]
  );
}

export async function markQueueFailed(queueId, error) {
  const p = getPool();
  await p.query(
    `UPDATE email_queue SET status = 'failed', error = $2, attempts = attempts + 1
     WHERE id = $1`,
    [queueId, String(error).slice(0, 500)]
  );
}

// Mark all pending recipients of a campaign as skipped (cancel).
export async function skipPending(campaignId) {
  const p = getPool();
  const res = await p.query(
    `UPDATE email_queue SET status = 'skipped'
     WHERE campaign_id = $1 AND status = 'pending'`,
    [campaignId]
  );
  return res.rowCount;
}

// Re-enqueue failed recipients so they get retried by the scheduler.
export async function resetFailedToPending(campaignId) {
  const p = getPool();
  const res = await p.query(
    `UPDATE email_queue SET status = 'pending', error = NULL
     WHERE campaign_id = $1 AND status = 'failed'`,
    [campaignId]
  );
  return res.rowCount;
}

export async function countByStatus(campaignId) {
  const p = getPool();
  const res = await p.query(
    `SELECT status, count(*)::int AS n
     FROM email_queue WHERE campaign_id = $1 GROUP BY status`,
    [campaignId]
  );
  const out = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of res.rows) out[r.status] = r.n;
  return out;
}
