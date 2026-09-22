import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import leadRouter from './routes/lead.js';
import adminRouter from './routes/admin.js';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.use(express.json());

// --- API routes (MUST be registered before the SPA fallback) ---
app.use('/api/lead', leadRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

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
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

start();
