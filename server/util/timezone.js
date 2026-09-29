// Timezone helpers for the silent-hours window (spec §9: do not send 21:00–08:00
// local; roll to 08:30). Uses Intl (no external dep). If the timezone is
// invalid, falls back to the server local time.

/**
 * Get the local hour (0–23) for a given Date in an IANA timezone.
 * @param {Date} date
 * @param {string} timeZone - IANA tz, e.g. "America/Mexico_City"
 * @returns {number} hour 0..23 (can be 24 in rare Intl edge cases -> normalize)
 */
export function localHour(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    let h = parseInt(hour, 10);
    if (Number.isNaN(h)) return date.getHours();
    if (h === 24) h = 0; // some engines emit 24 for midnight
    return h;
  } catch {
    return date.getHours();
  }
}

const SILENT_START = 21; // 21:00
const SILENT_END = 8; // 08:00
const ROLL_HOUR = 8;
const ROLL_MINUTE = 30;

/**
 * Given a Date and a timezone, return a (possibly) adjusted Date that lands
 * outside the silent window. If inside [21:00, 08:00), roll forward to 08:30
 * local of the next applicable morning.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {Date}
 */
export function rollOutOfSilentWindow(date, timeZone) {
  const h = localHour(date, timeZone);
  const inSilent = h >= SILENT_START || h < SILENT_END;
  if (!inSilent) return date;

  // Build a date at 08:30 local on the same day, then push to next day if the
  // current time is already past 08:30 (i.e. we are in the early-morning side
  // of the window, which means we wait until today's 08:30 has passed -> next).
  // Simplest robust approach: move to "tomorrow 08:30 local".
  const base = new Date(date);
  // Shift to the next day first to avoid landing in the window.
  base.setDate(base.getDate() + 1);
  // Set 08:30 local by constructing from components is non-trivial without a
  // tz-aware lib; approximate using the server clock offset is risky.
  // Instead, advance until local hour is 8 and minute >= 30 on a non-silent day.
  let guard = 0;
  while (guard < 72 * 60) {
    const cand = new Date(base.getTime() + guard * 60 * 1000);
    const hh = localHour(cand, timeZone);
    const mm = new Intl.DateTimeFormat('en-US', { timeZone, minute: '2-digit', hour12: false })
      .formatToParts(cand)
      .find((p) => p.type === 'minute')?.value;
    const minute = parseInt(mm || '0', 10) || 0;
    if (hh === ROLL_HOUR && minute >= ROLL_MINUTE) {
      // ensure it's a non-silent day boundary (08:30 is never silent)
      return cand;
    }
    guard++;
  }
  // Fallback: +12h
  return new Date(date.getTime() + 12 * 60 * 60 * 1000);
}

/**
 * Compute the effective send_at for an event occurring at `occurredAt` plus
 * `delayMinutes`, rolled out of the silent window using the contact timezone.
 */
export function computeSendAt(occurredAt, delayMinutes, timeZone = 'America/Mexico_City') {
  const base = new Date(new Date(occurredAt).getTime() + delayMinutes * 60 * 1000);
  return rollOutOfSilentWindow(base, timeZone);
}
