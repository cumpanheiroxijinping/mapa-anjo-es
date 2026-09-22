import { Router } from 'express';
import { insertLead } from '../db.js';
import { createBrevoContact } from '../services/brevo.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/lead
// Body (any subset): first_name, email, gender, civil_status, birth_day,
//   birth_year, zodiac_sign, life_challenge, utm_*, utm_prefix, source, funnel_name
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const lead = {
      first_name: body.first_name,
      email,
      gender: body.gender,
      civil_status: body.civil_status,
      birth_day: body.birth_day,
      birth_year: body.birth_year,
      zodiac_sign: body.zodiac_sign,
      life_challenge: body.life_challenge,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      utm_term: body.utm_term,
      utm_content: body.utm_content,
      utm_prefix: body.utm_prefix,
      source: body.source || 'web',
      funnel_name: body.funnel_name || process.env.FUNNEL_NAME || 'angel_guarda',
    };

    // Persist to our Postgres (primary store)
    const saved = await insertLead(lead);

    // Push to Brevo (non-blocking for the user; never fail the lead on Brevo error)
    createBrevoContact(lead).catch((err) => console.error('[brevo] async error', err));

    res.json({ ok: true, id: saved.id });
  } catch (err) {
    console.error('[lead] error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
