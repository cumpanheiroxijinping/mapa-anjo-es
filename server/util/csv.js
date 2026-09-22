// Serialize an array of lead rows into CSV.
const COLUMNS = [
  'id', 'first_name', 'email', 'gender', 'civil_status', 'birth_day',
  'birth_year', 'zodiac_sign', 'life_challenge', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_term', 'utm_content', 'utm_prefix', 'source', 'created_at',
];

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function leadsToCsv(rows) {
  const header = COLUMNS.join(',');
  const lines = rows.map((row) => COLUMNS.map((c) => escapeCell(row[c])).join(','));
  return [header, ...lines].join('\n');
}
