// Pure time-zone helpers built on the browser's Intl API (no libraries).
// Kept free of DOM code so it can be tested with Node.
// Plain script (not an ES module) so the page also works when opened from disk.
(function () {

const partsFormatters = new Map();

function partsFormatter(tz) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of `instant` (ms since epoch) in time zone `tz`. */
function getParts(instant, tz) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return {
    year: +out.year,
    month: +out.month,
    day: +out.day,
    hour: +out.hour % 24,
    minute: +out.minute,
    second: +out.second,
    weekday: out.weekday,
  };
}

/** UTC offset of `tz` at `instant`, in minutes (e.g. +330 for India). */
function offsetMinutes(instant, tz) {
  const p = getParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const floored = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc - floored) / 60000);
}

/**
 * Instant (ms) at which the wall clock in `tz` shows the given local time.
 * For times skipped by a DST jump, returns the instant just after the jump.
 * For repeated times (DST fall-back), returns the first occurrence.
 */
function wallToInstant({ year, month, day, hour = 0, minute = 0 }, tz) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = offsetMinutes(asUtc, tz);
  let t = asUtc - o1 * 60000;
  const o2 = offsetMinutes(t, tz);
  if (o2 !== o1) {
    const t2 = asUtc - o2 * 60000;
    // Prefer the candidate whose wall clock actually matches; otherwise the
    // local time does not exist (DST gap) and we take the later instant.
    const p2 = getParts(t2, tz);
    t = (p2.hour === hour && p2.minute === minute) ? t2 : Math.max(t, t2);
  }
  // Fall-back ambiguity: if an hour earlier shows the same wall time, use it.
  const earlier = t - 3600000;
  const pe = getParts(earlier, tz);
  if (pe.year === year && pe.month === month && pe.day === day && pe.hour === hour && pe.minute === minute) {
    t = earlier;
  }
  return t;
}

/** "UTC+5:30", "UTC−3", "UTC" */
function formatOffset(mins) {
  if (mins === 0) return 'UTC';
  const sign = mins > 0 ? '+' : '−';
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse "UTC+3", "GMT-5", "+2" (whole hours) into an IANA "Etc/GMT" zone.
 * Note the IANA sign is inverted: UTC+3 is "Etc/GMT-3".
 */
function parseUtcOffsetZone(text) {
  const m = /^\s*(?:utc|gmt)?\s*([+-−])\s*(\d{1,2})(?::00)?\s*$/i.exec(text);
  if (!m) {
    if (/^\s*(utc|gmt)\s*$/i.test(text)) return 'Etc/UTC';
    return null;
  }
  const sign = m[1] === '+' ? 1 : -1;
  const h = +m[2];
  if (h > 14 || (sign < 0 && h > 12)) return null;
  if (h === 0) return 'Etc/UTC';
  return `Etc/GMT${sign > 0 ? '-' : '+'}${h}`;
}

/** Whole-day difference between two {year,month,day} calendar dates (b − a). */
function dayDiff(a, b) {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

/** Add `n` days to a calendar date. */
function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "YYYY-MM-DDTHH:MM" for <input type="datetime-local"> */
function toLocalInputValue(p) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function parseLocalInputValue(v) {
  const m = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
}

/** Rough part of day for a local hour (fractional allowed). */
function dayPart(hour) {
  if (hour < 6 || hour >= 22) return 'night';
  if (hour < 9) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

const TZ = { getParts, offsetMinutes, wallToInstant, formatOffset, isValidTimeZone, parseUtcOffsetZone, dayDiff, addDays, toLocalInputValue, parseLocalInputValue, dayPart };
if (typeof module !== 'undefined' && module.exports) module.exports = TZ;
else globalThis.TZ = TZ;
})();
