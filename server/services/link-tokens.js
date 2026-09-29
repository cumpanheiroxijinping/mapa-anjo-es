// Opaque, signed tokens for self-hosted links (unsubscribe, etc.).
// Uses HMAC-SHA256 over the email with a server secret. No DB lookup needed
// to verify; the token maps back to the email deterministically.

import crypto from 'crypto';

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_TOKEN || 'insecure-unsub-secret';
}

// Token format: <email>.<hmac> (email is reversible; acceptable for opt-out).
export function buildUnsubscribeToken(email) {
  const e = (email || '').toString().toLowerCase();
  const mac = crypto.createHmac('sha256', secret()).update(e).digest('hex').slice(0, 24);
  return `${Buffer.from(e).toString('base64url')}.${mac}`;
}

export function verifyUnsubscribeToken(token) {
  if (!token || !token.includes('.')) return null;
  const [b64, mac] = token.split('.');
  let email;
  try {
    email = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret()).update(email.toLowerCase()).digest('hex').slice(0, 24);
  // constant-time compare
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email.toLowerCase();
}
