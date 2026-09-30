// Remove test data from the Mapa admin tables.
//
// Targets emails ending in @test.com / @exemplo.com / @test.* (the e2e / debug
// payloads created by server/scripts/e2e-spec15.mjs and manual postback tests).
//
// Idempotent and scoped — only touches test emails. Run with:
//   node server/scripts/cleanup-test-data.js          # dry run (counts only)
//   node server/scripts/cleanup-test-data.js --yes     # actually delete
//
// Requires DATABASE_URL in the environment (loaded from .env if present).
import pg from 'pg';

const { Pool } = pg;

const TEST_COND = `email IS NOT NULL AND (
  email ILIKE '%@test.com'
  OR email ILIKE '%@exemplo.com'
  OR email ILIKE '%@test.%'
)`;

const TABLES = [
  'postback_log',
  'pending_sends',
  'automation_instances',
  'contact_states',
  // leads is the public quiz capture table — only delete test emails there too.
  'leads',
  // transactions (if the table exists) — best effort.
  'transactions',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Export it or run with `node -r dotenv/config ...`.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = !process.argv.includes('--yes');

  try {
    for (const table of TABLES) {
      // Confirm the table exists before touching it.
      const exists = await pool.query(
        `SELECT to_regclass($1) AS t`,
        [`public.${table}`]
      );
      if (!exists.rows[0].t) {
        console.log(`⏭  ${table}: tabela não existe — pulada`);
        continue;
      }
      const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE ${TEST_COND}`, []);
      const count = countRes.rows[0].c;
      if (dryRun) {
        console.log(`🔍 ${table}: ${count} registro(s) de teste seriam removidos`);
      } else {
        const del = await pool.query(`DELETE FROM ${table} WHERE ${TEST_COND}`, []);
        console.log(`🗑  ${table}: ${del.rowCount} removido(s)`);
      }
    }
  } finally {
    await pool.end();
  }

  if (dryRun) {
    console.log('\nModo dry-run: nenhum dado foi removido.');
    console.log('Para remover de verdade, rode: node server/scripts/cleanup-test-data.js --yes');
  } else {
    console.log('\nLimpeza concluída.');
  }
}

main().catch((err) => {
  console.error('Erro na limpeza:', err.message);
  process.exit(1);
});
