import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { getParts, offsetMinutes, wallToInstant, formatOffset, parseUtcOffsetZone, dayDiff, addDays, isValidTimeZone } = createRequire(import.meta.url)('../tz.js');

test('offsets', () => {
  const t = Date.UTC(2026, 0, 15, 12);
  assert.equal(offsetMinutes(t, 'Asia/Kolkata'), 330);
  assert.equal(offsetMinutes(t, 'America/New_York'), -300);
  assert.equal(offsetMinutes(Date.UTC(2026, 6, 15, 12), 'America/New_York'), -240);
  assert.equal(offsetMinutes(t, 'Asia/Kathmandu'), 345);
});

test('wallToInstant round-trips across many zones and dates', () => {
  const zones = ['Europe/London', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo', 'Pacific/Chatham', 'America/St_Johns', 'Europe/Kyiv'];
  for (const tz of zones) for (let d = 0; d < 365; d += 3) for (const h of [0, 1, 2, 3, 12, 23]) {
    const date = addDays({ year: 2026, month: 1, day: 1 }, d);
    const want = { ...date, hour: h, minute: 30 };
    const t = wallToInstant(want, tz);
    const p = getParts(t, tz);
    const ok = p.hour === h && p.minute === 30 && p.day === date.day;
    if (!ok) {
      // must be a DST gap: the hour before and after differ in offset
      assert.notEqual(offsetMinutes(t - 7200000, tz), offsetMinutes(t + 7200000, tz), `${tz} ${JSON.stringify(want)}`);
    }
  }
});

test('DST gap and overlap', () => {
  // London springs forward 2026-03-29 01:00 -> 02:00
  const gap = wallToInstant({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, 'Europe/London');
  assert.equal(getParts(gap, 'Europe/London').hour, 2);
  // NY falls back 2026-11-01 02:00 -> 01:00; 01:30 is ambiguous, take first (EDT)
  const amb = wallToInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
  assert.equal(amb, Date.UTC(2026, 10, 1, 5, 30));
});

test('misc', () => {
  assert.equal(formatOffset(330), 'UTC+5:30');
  assert.equal(formatOffset(-180), 'UTC−3');
  assert.equal(formatOffset(0), 'UTC');
  assert.equal(parseUtcOffsetZone('UTC+3'), 'Etc/GMT-3');
  assert.equal(parseUtcOffsetZone('gmt -5'), 'Etc/GMT+5');
  assert.equal(parseUtcOffsetZone('UTC'), 'Etc/UTC');
  assert.equal(parseUtcOffsetZone('London'), null);
  assert.equal(offsetMinutes(Date.now(), parseUtcOffsetZone('UTC+3')), 180);
  assert.equal(dayDiff({ year: 2026, month: 12, day: 31 }, { year: 2027, month: 1, day: 1 }), 1);
  assert.ok(isValidTimeZone('Europe/Madrid'));
  assert.ok(!isValidTimeZone('Mars/Base'));
});
