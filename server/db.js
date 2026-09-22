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
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
`;

export async function initDb() {
  const p = getPool();
  await p.query(CREATE_TABLE);
  console.log('[db] leads table ready');
}

export async function insertLead(lead) {
  const p = getPool();
  const q = `
    INSERT INTO leads
      (first_name, email, gender, civil_status, birth_day, birth_year,
       zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
       utm_term, utm_content, utm_prefix, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
