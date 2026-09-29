import { Router } from 'express';
import { recordOpen, recordClick, getTrackingPixel } from '../services/email-tracking.js';
import { verifyUnsubscribeToken } from '../services/link-tokens.js';
import { updateContactState } from '../db.js';

const router = Router();

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}
function userAgent(req) {
  return req.headers['user-agent'] || '';
}

// GET /t/o/:trackId  -> 1x1 transparent pixel + record "open".
// Public (no auth): it's hit by email clients loading the pixel.
router.get('/o/:trackId', async (req, res) => {
  const { trackId } = req.params;
  // Fire-and-forget; never block the pixel response.
  recordOpen(trackId, clientIp(req), userAgent(req)).catch(() => {});
  const pixel = getTrackingPixel();
  res.set('Content-Type', 'image/png');
  res.set('Content-Length', String(pixel.length));
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(pixel);
});

// GET /t/c/:trackId?url=...  -> record "click" then 302 redirect.
router.get('/c/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).send('Invalid redirect URL');
  }
  recordClick(trackId, url, clientIp(req), userAgent(req)).catch(() => {});
  res.redirect(302, url);
});

// GET /t/u/:token  -> one-click unsubscribe (spec §8/§12). Records opt-out and
// renders a confirmation page.
router.get('/u/:token', async (req, res) => {
  const email = verifyUnsubscribeToken(req.params.token);
  if (!email) {
    return res.status(400).send(
      '<html><body style="font-family:Arial;padding:40px;text-align:center;color:#444">' +
      '<h2>Solicitud no válida</h2>' +
      '<p>El enlace de cancelación no es válido o ha expirado.</p>' +
      '</body></html>'
    );
  }
  try {
    await updateContactState(email, {
      unsubscribe_at: new Date().toISOString(),
      suppression_all_marketing: true,
      funnel_stage: 'UNSUBSCRIBED',
      tagsToAdd: ['stage:unsubscribed', 'suppression:all_marketing'],
    });
  } catch (err) {
    console.error('[tracking] unsubscribe error', err.message);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(
    '<html><body style="font-family:Arial;padding:40px;text-align:center;color:#222;background:#0b1020">' +
    '<h2 style="color:#f4d58d;">Te has dado de baja</h2>' +
    '<p style="color:#cdd;">No volveremos a enviarte correos de marketing, ' + email + '.</p>' +
    '<p style="color:#9aa0b5;font-size:13px;">Si fue un error, contáctanos en ' +
    (process.env.SUPPORT_EMAIL || 'hola@mapa-del-angel.com') + '.</p>' +
    '</body></html>'
  );
});

export default router;
