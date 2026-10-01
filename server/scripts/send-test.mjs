// One-off test sender: renders + sends a template to a single lead via Brevo,
// WITHOUT going through the admin API (so it works even if the local server
// lacks JWT_SECRET/ADMIN_TOKEN). Reads config from the environment.
//
// Usage:
//   DATABASE_URL=... BREVO_API_KEY=... CHECKOUT_URL=... SUPPORT_URL=... \
//   TRACKING_BASE_URL=... node server/scripts/send-test.mjs <email> <template>

import { getPool } from '../db.js';
import {
  sendTemplateEmail, leadToTemplateVars, parseTemplateFile, getTemplateFile, substituteVariables,
} from '../services/email-sender.js';

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

  console.log('Lead:', JSON.stringify(lead));
  const vars = leadToTemplateVars(lead);
  const tmpl = parseTemplateFile(getTemplateFile(template));
  const subject = substituteVariables(tmpl.subject, vars);
  const html = substituteVariables(tmpl.html, vars);
  const leftover = (subject + html).match(/%[A-Z_][A-Z0-9_]*(\|[^%]*)?%/g) || [];
  console.log('Subject:', subject);
  console.log('Leftover placeholders:', leftover.length ? leftover : '(none)');

  const result = await sendTemplateEmail({ email, template, lead, vars });
  console.log('SENT. trackId =', result.trackId);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
