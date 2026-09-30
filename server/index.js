import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import leadRouter from './routes/lead.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import leadsAdminRouter from './routes/leads.js';
import transactionsRouter from './routes/transactions.js';
import emailRouter from './routes/email.js';
import trackingRouter from './routes/tracking.js';
import brevoWebhookRouter from './routes/brevo-webhook.js';
import eventRouter from './routes/event.js';
import perfectPayRouter from './routes/perfectpay-webhook.js';
import monitorRouter from './routes/monitor.js';
import { initDb } from './db.js';
import { startEmailScheduler } from './services/email-campaign.js';
import { startAutomationEngine } from './services/automation-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.use(express.json());

// --- API routes (MUST be registered before the SPA fallback) ---
app.use('/api/lead', leadRouter);
app.use('/api/admin', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', leadsAdminRouter);
app.use('/api/admin', transactionsRouter);
app.use('/api/email', emailRouter);
app.use('/api/brevo/webhook', brevoWebhookRouter);
app.use('/api/event', eventRouter);
app.use('/api/postback', perfectPayRouter);
app.use('/api/monitor', monitorRouter);

// --- Self-hosted email tracking (pixel + click redirect) ---
// Public routes, served off the public TRACKING_BASE_URL. Registered before the
// SPA fallback so they are never swallowed by index.html.
app.use('/t', trackingRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Global error handler — always respond JSON (never the default HTML 500 page),
// so the admin frontend can surface the real error message instead of "request_failed".
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (res.headersSent) return;
  const status = err.status || (err.statusCode) || 500;
  console.error('[error]', err.message);
  res.status(status).json({ ok: false, error: 'server_error', message: err.message || 'internal_error' });
});

// --- Standalone funnel pages (upsell / downsell / thank-you) ---
// These live in root folders (up1, up2, up3, dw1, dw2, dw3, gracias) as
// self-contained HTML and must be reachable at /up1, /up2, ... /gracias.
const funnelFolders = ['up1', 'up2', 'up3', 'dw1', 'dw2', 'dw3', 'gracias', 'soporte'];
for (const folder of funnelFolders) {
  const dir = path.join(__dirname, '..', folder);
  if (fs.existsSync(dir)) {
    app.use('/' + folder, express.static(dir, { extensions: ['html'] }));
  }
}

// --- Static frontend ---
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA history-mode fallback: any non-api GET serves index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.send('Frontend not built yet. Run `npm run build` or use `npm run dev` for the Vite dev server.')
  );
}

const PORT = process.env.PORT || 3000;

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDb();
    } catch (err) {
      console.error('[db] init failed', err);
    }
  } else {
    console.warn('[db] DATABASE_URL not set — lead persistence disabled');
  }

  // Email campaign scheduler (in-process). No-op if Brevo key missing, but the
  // timer is harmless and lets campaigns run once credentials are added.
  try {
    startEmailScheduler();
  } catch (err) {
    console.error('[scheduler] failed to start', err);
  }

  // Event-driven automation engine (timers, exclusions, silent hours).
  try {
    startAutomationEngine();
  } catch (err) {
    console.error('[automation] failed to start', err);
  }

  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

start();
