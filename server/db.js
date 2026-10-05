import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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

const CREATE_CONTACT_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS contact_states (
  email                    TEXT PRIMARY KEY,            -- normalized (lowercase), references leads(email)
  funnel_stage             TEXT NOT NULL DEFAULT 'QUIZ_NEW',
  main_product_status      TEXT NOT NULL DEFAULT 'none',-- none|pending|paid|refunded|chargeback
  payment_status           TEXT NOT NULL DEFAULT 'none',-- none|initiated|pending|failed|paid|refunded
  payment_method           TEXT,
  order_id                 TEXT,
  offer_id                 TEXT DEFAULT 'main',
  main_product_price       NUMERIC,
  main_product_currency    TEXT,
  purchase_at              TIMESTAMPTZ,
  refund_at                TIMESTAMPTZ,
  chargeback_opened        BOOLEAN NOT NULL DEFAULT FALSE,
  upsell_status            TEXT NOT NULL DEFAULT 'not_seen',-- not_seen|seen|paid|declined
  upsell_purchase_at       TIMESTAMPTZ,
  support_status           TEXT NOT NULL DEFAULT 'normal',-- normal|awaiting|issue
  locale                   TEXT,
  country                  TEXT,
  phone                    TEXT,
  timezone                 TEXT NOT NULL DEFAULT 'America/Mexico_City',
  consent_email_at         TIMESTAMPTZ,
  unsubscribe_at           TIMESTAMPTZ,
  suppression_all_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_recovery     BOOLEAN NOT NULL DEFAULT FALSE,
  hard_bounce              BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_step_reached        INTEGER,
  quiz_completed_at        TIMESTAMPTZ,
  primary_challenge        TEXT,                         -- love|finance|health|happiness
  last_promo_email_at      TIMESTAMPTZ,                  -- 12h-gap enforcement (spec §9)
  last_activity_at         TIMESTAMPTZ,
  first_touch_at           TIMESTAMPTZ,
  last_touch_at            TIMESTAMPTZ,
  lead_source              TEXT,
  tags                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  lists                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_stage ON contact_states(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_cs_main_status ON contact_states(main_product_status);
CREATE INDEX IF NOT EXISTS idx_cs_unsub ON contact_states(unsubscribe_at);
`;

const CREATE_FUNNEL_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS funnel_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT UNIQUE NOT NULL,        -- idempotency key (spec §15); any unique string
  email        TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  funnel_name  TEXT NOT NULL DEFAULT 'angel_guarda',
  occurred_at  TIMESTAMPTZ,
  page_url     TEXT,
  utm          JSONB,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fe_email_time ON funnel_events(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fe_name ON funnel_events(event_name);
`;

const CREATE_AUTOMATION_INSTANCES_TABLE = `
CREATE TABLE IF NOT EXISTS automation_instances (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  automation_key TEXT NOT NULL,             -- A..K (spec §10)
  status        TEXT NOT NULL DEFAULT 'active', -- active|completed|cancelled
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Prevent duplicate ACTIVE instances per (email, automation).
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_instance
  ON automation_instances(email, automation_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_email ON automation_instances(email);
`;

const CREATE_PENDING_SENDS_TABLE = `
CREATE TABLE IF NOT EXISTS pending_sends (
  id                    BIGSERIAL PRIMARY KEY,
  email                 TEXT NOT NULL,
  automation_instance_id BIGINT REFERENCES automation_instances(id) ON DELETE CASCADE,
  automation_key        TEXT NOT NULL,
  step_key              TEXT NOT NULL,
  template              TEXT NOT NULL,
  vars                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority              INTEGER NOT NULL,   -- 1 highest .. 8 broadcast (spec §9)
  status                TEXT NOT NULL DEFAULT 'pending', -- pending|cancelled|sent|failed
  send_at               TIMESTAMPTZ NOT NULL, -- already rolled out of silent hours
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at               TIMESTAMPTZ,
  track_id              TEXT,
  attempts              INTEGER NOT NULL DEFAULT 0,
  error                 TEXT
);
CREATE INDEX IF NOT EXISTS idx_ps_due ON pending_sends(status, send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ps_email_status ON pending_sends(email, status);
CREATE INDEX IF NOT EXISTS idx_ps_instance ON pending_sends(automation_instance_id);
`;

const CREATE_POSTBACK_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS postback_log (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,         -- Perfect Pay order code (idempotency)
  email        TEXT,
  raw_payload  JSONB NOT NULL,
  status       TEXT,
  mapped_event TEXT,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pb_email ON postback_log(email);
`;

const CREATE_ADMIN_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'support',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
`;

const CREATE_TRANSACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,   -- Perfect Pay code (idempotency)
  email TEXT,
  name TEXT,
  product TEXT,
  value NUMERIC,
  currency TEXT,
  status TEXT,                           -- approved|canceled|rejected|chargeback|abandonment|pending
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_email ON transactions(email);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
`;

// Persistent bulk-job queue for the admin "Disparar" action. Items are stored
// in the DB so a container restart mid-run does not lose work — the processor
// reclaims any item left in 'processing' and resumes.
const CREATE_BULK_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id            BIGSERIAL PRIMARY KEY,
  job_id        TEXT NOT NULL,
  mode          TEXT NOT NULL,          -- reapply | resend
  event         TEXT,                  -- for reapply (abandonment|rejected|canceled)
  automation_key TEXT,                -- F | G (derived)
  template      TEXT,                  -- for resend
  email         TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|processing|done|error
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bulk_pending ON bulk_jobs(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bulk_job ON bulk_jobs(job_id);
`;

// Click attribution for the intention-based redirector (spec §12). Best-effort
// log so each click is attributable to the source template; never stores PII or
// financial data.
const CREATE_REDIRECT_CLICKS_TABLE = `
CREATE TABLE IF NOT EXISTS redirect_clicks (
  id            BIGSERIAL PRIMARY KEY,
  email_id      TEXT,
  stage         TEXT,
  challenge     TEXT,
  contact_id    TEXT,
  provider      TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redirect_email_id ON redirect_clicks(email_id);
CREATE INDEX IF NOT EXISTS idx_redirect_created ON redirect_clicks(created_at DESC);
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
  await p.query(CREATE_CONTACT_STATE_TABLE);
  await p.query(CREATE_FUNNEL_EVENTS_TABLE);
  await p.query(CREATE_AUTOMATION_INSTANCES_TABLE);
  await p.query(CREATE_PENDING_SENDS_TABLE);
  await p.query(CREATE_POSTBACK_LOG_TABLE);
  await p.query(CREATE_ADMIN_USERS_TABLE);
  await p.query(CREATE_TRANSACTIONS_TABLE);
  await p.query(CREATE_BULK_JOBS_TABLE);
  await p.query(CREATE_REDIRECT_CLICKS_TABLE);
  // Normalize funnel_events.event_id to TEXT (was UUID). Allows any unique
  // idempotency string (spec §15) — e.g. postback "CODE_STATUS" composites.
  await p.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='funnel_events' AND column_name='event_id'
          AND data_type='uuid'
      ) THEN
        ALTER TABLE funnel_events
          ALTER COLUMN event_id TYPE text USING event_id::text;
      END IF;
    END $$;
  `).catch((e) => console.warn('[db] event_id migration skipped:', e.message));
  console.log('[db] leads + email + automation tables ready');
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

/**
 * List funnel-captured leads (table `leads`) with optional filters + pagination.
 * Returns { rows, total }.
 */
export async function listLeads({
  search, zodiac_sign, life_challenge, gender, utm_source, source, excludeTest = false, limit = 50, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  let n = 1;
  if (search) { where.push(`(email ILIKE $${n} OR first_name ILIKE $${n})`); params.push(`%${search}%`); n++; }
  if (zodiac_sign) { where.push(`zodiac_sign = $${n++}`); params.push(zodiac_sign); }
  if (life_challenge) { where.push(`life_challenge = $${n++}`); params.push(life_challenge); }
  if (gender) { where.push(`gender = $${n++}`); params.push(gender); }
  if (utm_source) { where.push(`utm_source = $${n++}`); params.push(utm_source); }
  if (source) { where.push(`source = $${n++}`); params.push(source); }
  if (excludeTest) { where.push(`email NOT ILIKE '%@test.com' AND email NOT ILIKE '%@exemplo.com' AND email NOT ILIKE '%@test.%'`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const p = getPool();
  const rows = await p.query(
    `SELECT id, first_name, email, gender, civil_status, birth_day, birth_year,
            zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign, source, created_at
     FROM leads ${clause} ORDER BY created_at DESC LIMIT $${n++} OFFSET $${n++}`,
    [...params, limit, offset]
  );
  const totalRes = await p.query(`SELECT count(*)::int AS c FROM leads ${clause}`, params);
  return { rows: rows.rows, total: totalRes.rows[0]?.c || 0 };
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

// ============================================================ Contact state

const CONTACT_STATE_COLUMNS = `
  email, funnel_stage, main_product_status, payment_status, payment_method,
  order_id, offer_id, main_product_price, main_product_currency, purchase_at,
  refund_at, chargeback_opened, upsell_status, upsell_purchase_at, support_status,
  locale, country, phone, timezone, consent_email_at, unsubscribe_at,
  suppression_all_marketing, suppression_recovery, hard_bounce, quiz_step_reached,
  quiz_completed_at, primary_challenge, last_promo_email_at, last_activity_at,
  first_touch_at, last_touch_at, lead_source, tags, lists, created_at, updated_at
`;

/**
 * Ensure a contact_states row exists for the email, returning the current row
 * (or a default-shaped object if DB unavailable). Inserts defaults on conflict.
 */
export async function upsertContactState(email, patch = {}) {
  const p = getPool();
  const e = (email || '').toString().toLowerCase();
  await p.query(
    `INSERT INTO contact_states (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING`,
    [e]
  );
  if (patch && Object.keys(patch).length) {
    await updateContactState(e, patch);
  }
  return getContactState(e);
}

export async function getContactState(email) {
  const p = getPool();
  const res = await p.query(
    `SELECT ${CONTACT_STATE_COLUMNS} FROM contact_states WHERE email = $1`,
    [(email || '').toString().toLowerCase()]
  );
  return res.rows[0] || null;
}

/**
 * Patch a contact_states row. `tags`/`lists` are MERGED (not replaced) when
 * passed as arrays. Numeric/date fields accept ISO strings or native types.
 */
export async function updateContactState(email, patch = {}) {
  const p = getPool();
  const e = (email || '').toString().toLowerCase();
  // Ensure row exists first (idempotent).
  await p.query(
    `INSERT INTO contact_states (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
    [e]
  );

  const sets = [];
  const params = [e];
  let n = 2;

  const scalar = ['funnel_stage', 'main_product_status', 'payment_status',
    'payment_method', 'order_id', 'offer_id', 'main_product_currency',
    'refund_at', 'locale', 'country', 'phone', 'timezone', 'lead_source',
    'quiz_step_reached', 'primary_challenge', 'support_status', 'upsell_status'];
  for (const k of scalar) {
    if (patch[k] !== undefined && patch[k] !== null) {
      sets.push(`${k} = $${n++}`);
      params.push(patch[k]);
    }
  }

  const tsFields = ['purchase_at', 'upsell_purchase_at', 'consent_email_at',
    'unsubscribe_at', 'last_promo_email_at', 'last_activity_at',
    'first_touch_at', 'last_touch_at', 'quiz_completed_at'];
  for (const k of tsFields) {
    if (patch[k] !== undefined && patch[k] !== null) {
      sets.push(`${k} = $${n++}`);
      params.push(patch[k]);
    }
  }

  const numeric = ['main_product_price'];
  for (const k of numeric) {
    if (patch[k] !== undefined && patch[k] !== null) {
      sets.push(`${k} = $${n++}`);
      params.push(Number(patch[k]));
    }
  }

  const boolFields = ['chargeback_opened', 'suppression_all_marketing',
    'suppression_recovery', 'hard_bounce'];
  for (const k of boolFields) {
    if (patch[k] !== undefined && patch[k] !== null) {
      sets.push(`${k} = $${n++}`);
      params.push(Boolean(patch[k]));
    }
  }

  // Merge JSONB arrays for tags / lists. Both add and remove must be combined
  // into a SINGLE assignment per column (Postgres rejects multiple assignments
  // to the same column in one UPDATE). Postgres has no `jsonb - jsonb`, so
  // removals use chaining `jsonb - text` (text = the array element string).
  const buildJsonbSet = (column, toAdd, toRemove) => {
    if ((!Array.isArray(toAdd) || !toAdd.length) && (!Array.isArray(toRemove) || !toRemove.length)) {
      return;
    }
    let expr = column;
    if (Array.isArray(toAdd) && toAdd.length) {
      expr = `(${expr} || $${n}::jsonb)`;
      params.push(JSON.stringify(toAdd));
      n++;
    }
    if (Array.isArray(toRemove) && toRemove.length) {
      for (const v of toRemove) {
        expr = `(${expr} - $${n})`;
        params.push(String(v));
        n++;
      }
    }
    sets.push(`${column} = ${expr}::jsonb`);
  };

  buildJsonbSet('tags', patch.tagsToAdd, patch.tagsToRemove);
  buildJsonbSet('lists', patch.listsToAdd, patch.listsToRemove);

  if (!sets.length) return;
  sets.push(`updated_at = now()`);
  await p.query(
    `UPDATE contact_states SET ${sets.join(', ')} WHERE email = $1`,
    params
  );
}

// ============================================================ Funnel events

/**
 * Insert a funnel event, ignoring duplicates by event_id (idempotency, spec §15).
 * Returns { inserted: boolean }.
 */
export async function insertFunnelEvent(ev) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO funnel_events
       (event_id, email, event_name, funnel_name, occurred_at, page_url, utm, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [
      ev.event_id,
      (ev.email || '').toString().toLowerCase(),
      ev.event_name,
      ev.funnel_name || process.env.FUNNEL_NAME || 'angel_guarda',
      ev.occurred_at || new Date().toISOString(),
      ev.page_url || null,
      JSON.stringify(ev.utm || {}),
      JSON.stringify(ev.metadata || {}),
    ]
  );
  return { inserted: res.rowCount > 0 };
}

// ===================================================== Automation instances

/**
 * Create an active automation instance, ignoring if one is already active
 * (partial unique index). Returns { created, id }.
 */
export async function upsertAutomationInstance(email, automationKey, startedAt) {
  const p = getPool();
  const e = (email || '').toString().toLowerCase();
  try {
    const res = await p.query(
      `INSERT INTO automation_instances (email, automation_key, started_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (email, automation_key) WHERE status = 'active' DO NOTHING
       RETURNING id`,
      [e, automationKey, startedAt || new Date().toISOString()]
    );
    return { created: res.rowCount > 0, id: res.rows[0]?.id || null };
  } catch (err) {
    // Unique violation fallback (race) -> treat as already active.
    if (err?.code === '23505') return { created: false, id: null };
    throw err;
  }
}

export async function getActiveInstances(email) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, email, automation_key, status, started_at
     FROM automation_instances WHERE email = $1 AND status = 'active'`,
    [(email || '').toString().toLowerCase()]
  );
  return res.rows;
}

/**
 * End an automation instance (completed|cancelled).
 */
export async function endAutomationInstance(id, status = 'completed') {
  const p = getPool();
  await p.query(
    `UPDATE automation_instances SET status = $2, ended_at = now() WHERE id = $1`,
    [id, status]
  );
}

// ============================================================ Pending sends

/**
 * Schedule a single send. Returns the inserted row id.
 */
export async function insertPendingSend({
  email, automationInstanceId, automationKey, stepKey,
  template, vars = {}, priority, sendAt,
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO pending_sends
       (email, automation_instance_id, automation_key, step_key, template, vars, priority, send_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING id`,
    [
      (email || '').toString().toLowerCase(),
      automationInstanceId || null,
      automationKey,
      stepKey,
      template,
      JSON.stringify(vars || {}),
      priority,
      sendAt,
    ]
  );
  return res.rows[0]?.id || null;
}

/**
 * Due pending sends (send_at <= now, status pending), ordered by priority then time.
 */
export async function getDuePendingSends(limit = 50) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, email, automation_instance_id, automation_key, step_key,
            template, vars, priority, send_at
     FROM pending_sends
     WHERE status = 'pending' AND send_at <= now()
     ORDER BY priority ASC, send_at ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function markPendingSent(id, trackId) {
  const p = getPool();
  await p.query(
    `UPDATE pending_sends SET status = 'sent', track_id = $2, sent_at = now(), attempts = attempts + 1
     WHERE id = $1`,
    [id, trackId]
  );
}

export async function markPendingFailed(id, error) {
  const p = getPool();
  await p.query(
    `UPDATE pending_sends SET status = 'failed', error = $2, attempts = attempts + 1
     WHERE id = $1`,
    [id, String(error).slice(0, 500)]
  );
}

/**
 * Cancel pending sends for an email, optionally only those with priority <= maxPriority
 * (used to pause lower-priority sequences when a higher-priority automation starts).
 * Returns number of rows cancelled.
 */
export async function cancelPendingByEmail(email, { onlyLowerPriorityThan = null, onlyAutomationKey = null } = {}) {
  const p = getPool();
  const e = (email || '').toString().toLowerCase();
  const clauses = [`email = $1`, `status = 'pending'`];
  const params = [e];
  let n = 2;
  if (onlyLowerPriorityThan != null) {
    clauses.push(`priority < $${n++}`);
    params.push(onlyLowerPriorityThan);
  }
  if (onlyAutomationKey) {
    clauses.push(`automation_key = $${n++}`);
    params.push(onlyAutomationKey);
  }
  const res = await p.query(
    `UPDATE pending_sends SET status = 'cancelled' WHERE ${clauses.join(' AND ')}`,
    params
  );
  return res.rowCount;
}

// ============================================================ Postback log

/**
 * Upsert a Perfect Pay postback by `code`. Reapplies when the status changes
 * (e.g. pending -> approved) so the state machine processes the transition.
 * Returns { inserted, statusChanged, row }.
 */
export async function insertPostbackLog({ code, email, rawPayload, status, mappedEvent }) {
  const p = getPool();
  const e = email ? (email || '').toString().toLowerCase() : null;
  const existing = await p.query(
    `SELECT id, status FROM postback_log WHERE code = $1`,
    [code]
  );
  const prev = existing.rows[0];
  const statusChanged = !prev || prev.status !== status;
  await p.query(
    `INSERT INTO postback_log (code, email, raw_payload, status, mapped_event, processed_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, now())
     ON CONFLICT (code) DO UPDATE
       SET email = EXCLUDED.email,
           raw_payload = EXCLUDED.raw_payload,
           status = EXCLUDED.status,
           mapped_event = EXCLUDED.mapped_event,
           processed_at = now()`,
    [code, e, JSON.stringify(rawPayload || {}), status, mappedEvent]
  );
  return { inserted: !prev, statusChanged, row: prev || null };
}

// ============================================================ Monitoring reads

/**
 * List contact_states with optional filters + pagination.
 * Returns { rows, total }.
 */
export async function listContactStates({
  funnel_stage, main_product_status, suppression_recovery,
  primary_challenge, tag, search, excludeTest = true, limit = 50, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  let n = 1;
  if (funnel_stage)        { where.push(`funnel_stage = $${n++}`); params.push(funnel_stage); }
  if (main_product_status) { where.push(`main_product_status = $${n++}`); params.push(main_product_status); }
  if (suppression_recovery !== undefined && suppression_recovery !== null) {
    where.push(`suppression_recovery = $${n++}`); params.push(Boolean(suppression_recovery));
  }
  if (primary_challenge)   { where.push(`primary_challenge = $${n++}`); params.push(primary_challenge); }
  if (tag)                 { where.push(`tags @> $${n++}::jsonb`); params.push(JSON.stringify([tag])); }
  if (search)              { where.push(`email ILIKE $${n++}`); params.push(`%${search}%`); }
  if (excludeTest)         { where.push(`email NOT ILIKE '%@test.com' AND email NOT ILIKE '%@exemplo.com' AND email NOT ILIKE '%@test.%'`); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const p = getPool();
  const rows = await p.query(
    `SELECT ${CONTACT_STATE_COLUMNS}
     FROM contact_states ${clause}
     ORDER BY updated_at DESC
     LIMIT $${n++} OFFSET $${n++}`,
    [...params, limit, offset]
  );
  const totalRes = await p.query(`SELECT count(*)::int AS c FROM contact_states ${clause}`, params);
  return { rows: rows.rows, total: totalRes.rows[0]?.c || 0 };
}

/**
 * Recovery queue: leads with active automation instances (F/G/C/D/E...) and
 * their pending sends. Returns an array of { email, automation_key, started_at, pending[] }.
 */
export async function getRecoveryQueue({
  automationKeys = ['F', 'G', 'C', 'D', 'E'], excludeTest = true, limit = 50, offset = 0,
} = {}) {
  const p = getPool();
  const testClause = excludeTest
    ? ` AND cs.email NOT ILIKE '%@test.com' AND cs.email NOT ILIKE '%@exemplo.com' AND cs.email NOT ILIKE '%@test.%'`
    : '';
  const res = await p.query(
    `SELECT cs.email,
            ai.automation_key,
            ai.started_at,
            COALESCE(json_agg(json_build_object(
              'id', ps.id, 'template', ps.template,
              'send_at', ps.send_at, 'status', ps.status, 'priority', ps.priority
            ) ORDER BY ps.send_at ASC) FILTER (WHERE ps.id IS NOT NULL), '[]') AS pending
     FROM contact_states cs
     JOIN automation_instances ai ON ai.email = cs.email AND ai.status = 'active'
     LEFT JOIN pending_sends ps ON ps.email = cs.email
            AND ps.automation_key = ai.automation_key
            AND ps.status = 'pending'
     WHERE ai.automation_key = ANY($1)${testClause}
     GROUP BY cs.email, ai.automation_key, ai.started_at
     ORDER BY cs.email, ai.automation_key
     LIMIT $2 OFFSET $3`,
    [automationKeys, limit, offset]
  );
  return res.rows;
}

/**
 * List Perfect Pay postback logs (most recent first).
 */
export async function listPostbackLogs({ excludeTest = true, limit = 50, offset = 0 } = {}) {
  const p = getPool();
  const where = excludeTest
    ? `WHERE email IS NULL OR (email NOT ILIKE '%@test.com' AND email NOT ILIKE '%@exemplo.com' AND email NOT ILIKE '%@test.%')`
    : '';
  const res = await p.query(
    `SELECT code, email, status, mapped_event, processed_at, raw_payload
     FROM postback_log ${where}
     ORDER BY processed_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}

/**
 * List funnel events with optional email/date-range filters.
 */
export async function listFunnelEvents({
  email, from, to, limit = 50, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  let n = 1;
  if (email) { where.push(`email = $${n++}`); params.push(email.toLowerCase()); }
  if (from)  { where.push(`occurred_at >= $${n++}`); params.push(from); }
  if (to)    { where.push(`occurred_at <= $${n++}`); params.push(to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const p = getPool();
  const res = await p.query(
    `SELECT event_id, email, event_name, funnel_name, occurred_at, metadata
     FROM funnel_events ${clause}
     ORDER BY occurred_at DESC
     LIMIT $${n++} OFFSET $${n++}`,
    [...params, limit, offset]
  );
  return res.rows;
}

/**
 * Lightweight email list for bulk jobs. Optionally filtered by a tag (JSONB).
 */
export async function listContactEmails({ tag } = {}) {
  const p = getPool();
  if (tag) {
    const res = await p.query(
      `SELECT email FROM contact_states WHERE tags @> $1::jsonb`,
      [JSON.stringify([tag])]
    );
    return res.rows.map((r) => r.email);
  }
  const res = await p.query(`SELECT email FROM contact_states`);
  return res.rows.map((r) => r.email);
}

// ============================================================ Admin users

export async function getAdminUserById(id) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, username, email, password_hash, name, full_name, role, is_active, last_login, created_at
     FROM admin_users WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function findAdminUserByIdentifier(identifier) {
  const p = getPool();
  const res = await p.query(
    `SELECT * FROM admin_users
     WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)) AND is_active = true`,
    [identifier]
  );
  return res.rows[0] || null;
}

export async function listAdminUsers() {
  const p = getPool();
  const res = await p.query(
    `SELECT id, username, email, COALESCE(name, full_name) as name, role, is_active, last_login, created_at
     FROM admin_users ORDER BY created_at DESC`
  );
  return res.rows;
}

export async function createAdminUser({ username, email, passwordHash, name, role, createdBy }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO admin_users (username, email, password_hash, name, full_name, role, is_active, created_by)
     VALUES ($1, $2, $3, $4, $4, $5, true, $6)
     RETURNING id, username, email, COALESCE(name, full_name) as name, role, is_active, created_at`,
    [username, email, passwordHash, name || username, role || 'support', createdBy || null]
  );
  return res.rows[0];
}

export async function updateAdminUser(id, patch) {
  const p = getPool();
  const sets = [];
  const params = [id];
  let n = 2;
  if (patch.username !== undefined) { sets.push(`username = $${n++}`); params.push(patch.username); }
  if (patch.email !== undefined) { sets.push(`email = $${n++}`); params.push(patch.email); }
  if (patch.name !== undefined) { sets.push(`name = $${n++}`); params.push(patch.name); }
  if (patch.role !== undefined) { sets.push(`role = $${n++}`); params.push(patch.role); }
  if (patch.is_active !== undefined) { sets.push(`is_active = $${n++}`); params.push(patch.is_active); }
  if (patch.password_hash !== undefined) { sets.push(`password_hash = $${n++}`); params.push(patch.password_hash); }
  if (!sets.length) return null;
  const res = await p.query(
    `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, username, email, COALESCE(name, full_name) as name, role, is_active, created_at`,
    params
  );
  return res.rows[0] || null;
}

export async function deleteAdminUser(id) {
  const p = getPool();
  const res = await p.query('DELETE FROM admin_users WHERE id = $1 RETURNING username, email', [id]);
  return res.rows[0] || null;
}

// ============================================================ Bulk jobs (persistent)

/**
 * Enqueue one bulk-job item. Returns the inserted row id.
 * `jobId` groups a single "Disparar" action across all its targets.
 */
export async function insertBulkJob({ jobId, mode, event, automationKey, template, email, payload = {} }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO bulk_jobs (job_id, mode, event, automation_key, template, email, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
    [jobId, mode, event || null, automationKey || null, template || null,
     (email || '').toString().toLowerCase(), JSON.stringify(payload || {})]
  );
  return res.rows[0]?.id || null;
}

/** Count pending + done items for a job group (for progress display). */
export async function countBulkJob(jobId) {
  const p = getPool();
  const res = await p.query(
    `SELECT status, COUNT(*)::int AS c FROM bulk_jobs WHERE job_id = $1 GROUP BY status`,
    [jobId]
  );
  return res.rows;
}

/**
 * Claim the next N pending items (or items stuck in 'processing' from a prior
 * crash) and mark them 'processing' so they aren't picked up twice.
 */
export async function claimBulkJobs(limit = 50) {
  const p = getPool();
  const res = await p.query(
    `UPDATE bulk_jobs
     SET status = 'processing', attempts = attempts + 1, processed_at = now()
     WHERE id IN (
       SELECT id FROM bulk_jobs
       WHERE status = 'pending'
          OR (status = 'processing' AND processed_at < now() - interval '10 minutes')
       ORDER BY id ASC
       LIMIT $1
     )
     RETURNING *`,
    [limit]
  );
  return res.rows;
}

/** Mark a bulk-job item done (or error). */
export async function setBulkJobResult(id, status, error = null) {
  const p = getPool();
  await p.query(
    `UPDATE bulk_jobs SET status = $2, error = $3, processed_at = now() WHERE id = $1`,
    [id, status, error || null]
  );
}

// ============================================================ Transactions

/**
 * Upsert a Perfect Pay transaction by transaction_id (code). Idempotent: on a
 * status change it updates status/value/timestamps. Returns { inserted, updated }.
 */
export async function upsertTransaction({ code, email, name, product, value, currency, status, rawPayload }) {
  const p = getPool();
  const e = email ? email.toString().toLowerCase() : null;
  const existing = await p.query('SELECT id, status FROM transactions WHERE transaction_id = $1', [String(code)]);
  const prev = existing.rows[0];
  const statusChanged = !prev || prev.status !== status;
  await p.query(
    `INSERT INTO transactions (transaction_id, email, name, product, value, currency, status, raw_payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
     ON CONFLICT (transaction_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, transactions.email),
       name = COALESCE(EXCLUDED.name, transactions.name),
       product = COALESCE(EXCLUDED.product, transactions.product),
       value = COALESCE(EXCLUDED.value, transactions.value),
       currency = COALESCE(EXCLUDED.currency, transactions.currency),
       status = EXCLUDED.status,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = now()`,
    [String(code), e, name || null, product || null, value != null ? Number(value) : null, currency || null, status || null, JSON.stringify(rawPayload || {})]
  );
  return { inserted: !prev, updated: statusChanged, row: prev || null };
}

/**
 * List transactions with optional filters + pagination.
 * Returns { rows, total }.
 */
export async function listTransactions({
  search, status, startDate, endDate, limit = 50, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  let n = 1;
  if (search) { where.push(`(email ILIKE $${n} OR name ILIKE $${n} OR transaction_id ILIKE $${n})`); params.push(`%${search}%`); n++; }
  if (status) { where.push(`status = $${n++}`); params.push(status); }
  if (startDate && endDate) { where.push(`created_at::date >= $${n++}::date AND created_at::date <= $${n++}::date`); params.push(startDate, endDate); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const p = getPool();
  const rows = await p.query(
    `SELECT * FROM transactions ${clause} ORDER BY created_at DESC LIMIT $${n++} OFFSET $${n++}`,
    [...params, limit, offset]
  );
  const totalRes = await p.query(`SELECT count(*)::int AS c FROM transactions ${clause}`, params);
  return { rows: rows.rows, total: totalRes.rows[0]?.c || 0 };
}

export async function getTransactionStats() {
  const p = getPool();
  const [approved, refunded, chargeback, revenue, today, week] = await Promise.all([
    p.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE status = 'approved'`),
    p.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE status = 'refunded'`),
    p.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE status = 'chargeback'`),
    p.query(`SELECT COALESCE(SUM(value), 0)::float AS t FROM transactions WHERE status = 'approved'`),
    p.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE status = 'approved' AND created_at::date = NOW()::date`),
    p.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE status = 'approved' AND created_at >= NOW() - INTERVAL '7 days'`),
  ]);
  return {
    approved: approved.rows[0].c,
    refunded: refunded.rows[0].c,
    chargeback: chargeback.rows[0].c,
    revenue: revenue.rows[0].t || 0,
    today: today.rows[0].c,
    thisWeek: week.rows[0].c,
    total: approved.rows[0].c + refunded.rows[0].c + chargeback.rows[0].c,
  };
}
