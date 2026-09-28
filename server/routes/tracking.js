import { Router } from 'express';
import { recordOpen, recordClick, getTrackingPixel } from '../services/email-tracking.js';

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

export default router;
