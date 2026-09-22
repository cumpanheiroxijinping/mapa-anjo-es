// Brevo (Sendinblue) contacts integration.
// Docs: https://developers.brevo.com/reference/createcontact
// Auth uses the Marketing API key (header `api-key`), NOT the SMTP key.

const BREVO_API_URL = 'https://api.brevo.com/v3/contacts';

export async function createBrevoContact(lead) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log('[brevo] BREVO_API_KEY not set — skipping');
    return { skipped: true };
  }

  const listId = process.env.BREVO_LIST_ID ? Number(process.env.BREVO_LIST_ID) : undefined;

  const attributes = {
    FIRSTNAME: lead.first_name ?? '',
    GENDER: lead.gender ?? '',
    CIVIL_STATUS: lead.civil_status ?? '',
    BIRTH_DAY: lead.birth_day ?? '',
    BIRTH_YEAR: lead.birth_year ?? '',
    ZODIAC_SIGN: lead.zodiac_sign ?? '',
    LIFE_CHALLENGE: lead.life_challenge ?? '',
    UTM_PREFIX: lead.utm_prefix ?? '',
    FUNNEL_NAME: lead.funnel_name ?? process.env.FUNNEL_NAME ?? 'angel_guarda',
  };

  const body = {
    email: lead.email,
    attributes,
    updateEnabled: true, // upsert: avoids 400 on duplicate email
  };
  if (listId) body.listIds = [listId];

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    // 400 with "Contact already exist" is acceptable (updateEnabled handles it, but be safe)
    console.error('[brevo] error', res.status, text);
    return { ok: false, status: res.status, body: text };
  }
  console.log('[brevo] contact upserted', lead.email);
  return { ok: true, body: text };
}
