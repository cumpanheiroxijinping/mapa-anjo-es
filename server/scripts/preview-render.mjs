// Local validation script: render an email template for a given lead WITHOUT
// sending it (no Brevo call). Prints subject + which placeholders were filled
// vs. fell back to the template's fallback text.
//
// Usage: node server/scripts/preview-render.mjs <email> <template>
//   e.g. node server/scripts/preview-render.mjs madsonhenry.ads@gmail.com checkout_recovery_1
//
// Requires DATABASE_URL in the environment (loads .env if present via dotenv-like
// manual parse below, since the project doesn't depend on dotenv).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db.js';
import { leadToTemplateVars, parseTemplateFile, getTemplateFile, substituteVariables } from '../services/email-sender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Minimal .env loader so we can run without env vars exported.
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const email = process.argv[2] || 'madsonhenry.ads@gmail.com';
const template = process.argv[3] || 'checkout_recovery_1';

async function main() {
  const p = getPool();
  const r = await p.query(
    `SELECT first_name, email, gender, civil_status, birth_day, birth_year,
            zodiac_sign, life_challenge, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, utm_prefix
     FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const lead = r.rows[0];
  if (!lead) {
    console.error(`Lead not found: ${email}`);
    process.exit(2);
  }

  const tmpl = parseTemplateFile(getTemplateFile(template));
  const vars = leadToTemplateVars(lead);

  // Re-render but also detect fallback usage: temporarily blank each var to see
  // if the template would have fallen back. Simpler: show the merged vars used.
  const html = substituteVariables(tmpl.html, vars);
  const subject = tmpl.subject ? substituteVariables(tmpl.subject, vars) : '';

  // Report which placeholder tokens remain (left intact = unknown key, no fallback).
  const leftover = (subject + html).match(/%[A-Z_][A-Z0-9_]*(\|[^%]*)?%/g) || [];

  console.log('=== LEAD ===');
  console.log(JSON.stringify(lead, null, 2));
  console.log('\n=== TEMPLATE VARS (merged) ===');
  console.log(JSON.stringify(vars, null, 2));
  console.log('\n=== SUBJECT ===');
  console.log(subject);
  console.log('\n=== PLACEHOLDERS STILL PRESENT (intact / no value) ===');
  console.log(leftover.length ? leftover : '(none — all substituted)');
  console.log('\n=== HTML (first 1200 chars) ===');
  console.log(html.slice(0, 1200));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
