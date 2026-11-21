(() => {
const {
  getParts, offsetMinutes, wallToInstant, formatOffset, isValidTimeZone,
  parseUtcOffsetZone, dayDiff, addDays, toLocalInputValue, parseLocalInputValue, dayPart,
} = window.TZ;

const STORAGE_KEY = 'lesson-time-planner.v1';
const PART_LABEL = { night: '🌙 night', morning: '🌅 morning', day: '☀️ daytime', evening: '🌆 evening' };
const $ = (id) => document.getElementById(id);

// ---------- state ----------

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';

let state = load() ?? {
  me: { id: 'me', name: 'Me', tz: browserTz, place: '' },
  people: [],
  hour12: /^en-(US|CA|AU|IN|PH|NZ)/.test(navigator.language),
};
let ref = null; // null = live "now"; otherwise a chosen instant (ms)

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return raw && sanitize(raw);
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cleanPerson(p, id) {
  if (!p || typeof p !== 'object' || !isValidTimeZone(p.tz)) return null;
  return {
    id: id ?? (typeof p.id === 'string' ? p.id.slice(0, 40) : newId()),
    name: String(p.name ?? '').slice(0, 60) || 'Unnamed',
    tz: p.tz,
    place: String(p.place ?? '').slice(0, 120),
  };
}

/** Validate data from storage, a backup file or a share link. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const me = cleanPerson(raw.me, 'me') ?? { id: 'me', name: 'Me', tz: browserTz, place: '' };
  const people = Array.isArray(raw.people) ? raw.people.slice(0, 200).map((p) => cleanPerson(p)).filter(Boolean) : [];
  const ids = new Set();
  for (const p of people) {
    if (ids.has(p.id) || p.id === 'me') p.id = newId();
    ids.add(p.id);
  }
  return { me, people, hour12: !!raw.hour12 };
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

const now = () => ref ?? Date.now();

// ---------- formatting ----------

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts) + state.hour12;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour12: state.hour12, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}
const fmtTime = (t, tz) => fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(t);
const fmtDate = (t, tz) => fmt(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(t);
const fmtLongDate = (t, tz) => fmt(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(t);
const fmtFull = (t, tz) => fmt(tz, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(t);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function relDay(diff) {
  if (diff === 0) return '';
  if (diff === 1) return 'tomorrow for you';
  if (diff === -1) return 'yesterday for you';
  return `${diff > 0 ? '+' : ''}${diff} days`;
}

function zoneLabel(tz) {
  if (tz.startsWith('Etc/')) return '';
  return tz.split('/').pop().replace(/_/g, ' ');
}

// ---------- rendering ----------

function sortedPeople(t) {
  return [...state.people].sort((a, b) =>
    offsetMinutes(t, a.tz) - offsetMinutes(t, b.tz) || a.name.localeCompare(b.name));
}

function render() {
  const t = now();
  renderMode();
  renderPeople(t);
  renderGrid(t);
  $('hour12').checked = state.hour12;
}

function renderMode() {
  $('mode').innerHTML = ref == null
    ? '<span class="live-dot"></span> Showing <strong>current time</strong> (live)'
    : `Showing a <strong>chosen time</strong> <button type="button" id="back-now">Back to now</button>`;
}

function personRow(p, t, meParts) {
  const parts = getParts(t, p.tz);
  const off = offsetMinutes(t, p.tz);
  const diff = dayDiff(meParts, parts);
  const part = dayPart(parts.hour + parts.minute / 60);
  const isMe = p.id === 'me';
  const where = [p.place, zoneLabel(p.tz) && p.place.indexOf(zoneLabel(p.tz)) === -1 ? p.tz : '', formatOffset(off)]
    .filter(Boolean).map(esc).join(' · ');
  return `
    <li class="person ${isMe ? 'me' : ''} part-${part}" data-id="${esc(p.id)}">
      <div class="who">
        <div class="name">${esc(p.name)}${isMe ? ' <span class="tag">you</span>' : ''}</div>
        <div class="where">${where}</div>
      </div>
      <div class="when">
        <div class="time">${esc(fmtTime(t, p.tz))}</div>
        <div class="date">${esc(fmtDate(t, p.tz))}${diff && !isMe ? ` <span class="rel">${esc(relDay(diff))}</span>` : ''}</div>
        <div class="badge">${PART_LABEL[part]}</div>
      </div>
      <label class="set">
        <span>Set ${isMe ? 'my' : 'their'} time</span>
        <input type="datetime-local" value="${toLocalInputValue(parts)}" data-tz="${esc(p.tz)}">
      </label>
      <div class="actions">
        ${isMe ? '' : `<button type="button" class="small secondary" data-action="copy" title="Copy ${esc(p.name)}'s time and yours, to paste into a message" aria-label="Copy times for ${esc(p.name)}">📋 Copy</button>`}
        <button type="button" class="small secondary" data-action="edit" aria-label="Edit ${esc(p.name)}">Edit</button>
        ${isMe ? '' : `<button type="button" class="small secondary danger" data-action="remove" aria-label="Remove ${esc(p.name)}">Remove</button>`}
      </div>
    </li>`;
}

function renderPeople(t) {
  const meParts = getParts(t, state.me.tz);
  let html = personRow(state.me, t, meParts);
  for (const p of sortedPeople(t)) html += personRow(p, t, meParts);
  if (!state.people.length) {
    html += '<li class="empty">No students yet. Add someone below 👇</li>';
  }
  $('people').innerHTML = html;
}

function renderGrid(t) {
  const meTz = state.me.tz;
  const base = getParts(t, meTz);
  const date = { year: base.year, month: base.month, day: base.day };
  $('grid-date').textContent = fmtLongDate(t, meTz);

  const hours = [];
  for (let h = 0; h < 24; h++) hours.push(wallToInstant({ ...date, hour: h, minute: 0 }, meTz));
  // Skip duplicate instants created by a DST gap (e.g. 01:00 and 02:00 both map to 02:00).
  const cols = hours.filter((x, i) => i === 0 || x !== hours[i - 1]);
  const selected = cols.reduce((best, x) => (x <= t ? x : best), cols[0]);

  const rows = [state.me, ...sortedPeople(t)];
  let html = '<thead><tr><th scope="col"></th>';
  for (const c of cols) {
    const p = getParts(c, meTz);
    html += `<th scope="col" class="${c === selected ? 'sel' : ''}">${esc(shortHour(p))}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const person of rows) {
    html += `<tr><th scope="row" title="${esc(person.tz)}">${esc(person.name)}</th>`;
    for (const c of cols) {
      const p = getParts(c, person.tz);
      const diff = dayDiff(date, p);
      const part = dayPart(p.hour + p.minute / 60);
      const mark = diff ? `<sup>${diff > 0 ? '+' : '−'}${Math.abs(diff)}</sup>` : '';
      html += `<td class="${part}${c === selected ? ' sel' : ''}" data-t="${c}" title="${esc(person.name)}: ${esc(fmtFull(c, person.tz))}">${esc(shortHour(p))}${mark}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  $('grid').innerHTML = html;
  // Keep the selected hour in view on narrow screens.
  const wrap = $('grid').parentElement;
  const sel = $('grid').querySelector('thead th.sel');
  if (sel && wrap.scrollWidth > wrap.clientWidth) {
    wrap.scrollLeft = sel.offsetLeft - wrap.clientWidth / 2 + sel.offsetWidth / 2;
  }
}

function shortHour(p) {
  const mm = p.minute ? ':' + String(p.minute).padStart(2, '0') : '';
  if (!state.hour12) return `${p.hour}${mm}`;
  const h = p.hour % 12 || 12;
  return `${h}${mm}${p.hour < 12 ? 'a' : 'p'}`;
}

// ---------- interactions: people list & grid ----------

function setRef(t) {
  ref = t;
  render();
}

$('mode').addEventListener('click', (e) => {
  if (e.target.id === 'back-now') setRef(null);
});

$('people').addEventListener('change', (e) => {
  const input = e.target.closest('input[type="datetime-local"]');
  if (!input) return;
  const wall = parseLocalInputValue(input.value);
  if (!wall) return;
  setRef(wallToInstant(wall, input.dataset.tz));
});

$('people').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.person').dataset.id;
  const person = id === 'me' ? state.me : state.people.find((p) => p.id === id);
  if (!person) return;
  if (btn.dataset.action === 'copy') {
    copyWithFeedback(btn, timesText([person, state.me], 'Lesson time:', 'Current time:'));
  } else if (btn.dataset.action === 'remove') {
    if (confirm(`Remove ${person.name}?`)) {
      state.people = state.people.filter((p) => p.id !== id);
      save();
      render();
    }
  } else {
    startEdit(person);
  }
});

$('grid').addEventListener('click', (e) => {
  const cell = e.target.closest('td[data-t]');
  if (cell) setRef(+cell.dataset.t);
});

function shiftDays(n) {
  const t = now();
  const p = getParts(t, state.me.tz);
  setRef(wallToInstant({ ...addDays(p, n), hour: p.hour, minute: p.minute }, state.me.tz));
}
$('prev-day').addEventListener('click', () => shiftDays(-1));
$('next-day').addEventListener('click', () => shiftDays(1));

// ---------- add / edit form with place search ----------

const allZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
let chosen = null;       // { place, tz }
let suggestions = [];    // [{ label, place, tz }]
let activeIdx = -1;
let searchTimer = 0;
let searchAbort = null;

const placeInput = $('place');
const list = $('suggestions');

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_/,]+/g, ' ').trim();
}

function localMatches(q) {
  const out = [];
  const offsetZone = parseUtcOffsetZone(q);
  if (offsetZone) out.push({ label: `${q.trim().toUpperCase()} (fixed offset, no daylight saving)`, place: '', tz: offsetZone });
  if (isValidTimeZone(q.trim()) && q.includes('/')) out.push({ label: q.trim(), place: '', tz: q.trim() });
  const nq = norm(q);
  if (nq.length >= 2) {
    for (const z of allZones) {
      if (out.length >= 6) break;
      if (norm(z).includes(nq) && !out.some((o) => o.tz === z)) out.push({ label: `${z.replace(/_/g, ' ')} (time zone)`, place: '', tz: z });
    }
  }
  return out;
}

async function remoteMatches(q, signal) {
  if (q.trim().length < 2 || parseUtcOffsetZone(q)) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q.trim())}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || [])
    .filter((r) => r.timezone && isValidTimeZone(r.timezone))
    .map((r) => {
      const place = [r.name, r.admin1 !== r.name ? r.admin1 : '', r.country].filter(Boolean).join(', ');
      return { label: place, place: [r.name, r.country].filter(Boolean).join(', '), tz: r.timezone };
    });
}

function showSuggestions(items) {
  suggestions = items;
  activeIdx = -1;
  if (!items.length) {
    list.hidden = true;
    return;
  }
  const t = Date.now();
  list.innerHTML = items.map((s, i) =>
    `<li role="option" data-i="${i}"><span>${esc(s.label)}</span><small>${esc(fmtTime(t, s.tz))} · ${esc(formatOffset(offsetMinutes(t, s.tz)))}</small></li>`).join('');
  list.hidden = false;
}

function choose(s) {
  chosen = { place: s.place, tz: s.tz };
  placeInput.value = s.place || s.tz;
  list.hidden = true;
  renderChosen();
}

function renderChosen() {
  $('chosen').innerHTML = chosen
    ? `✔ ${esc(chosen.tz)} · now ${esc(fmtTime(Date.now(), chosen.tz))} (${esc(formatOffset(offsetMinutes(Date.now(), chosen.tz)))})`
    : '';
}

placeInput.addEventListener('input', () => {
  chosen = null;
  renderChosen();
  const q = placeInput.value;
  const local = localMatches(q);
  showSuggestions(local);
  clearTimeout(searchTimer);
  searchAbort?.abort();
  searchTimer = setTimeout(async () => {
    searchAbort = new AbortController();
    try {
      const remote = await remoteMatches(q, searchAbort.signal);
      if (placeInput.value === q) showSuggestions([...remote, ...local].slice(0, 8));
    } catch (err) {
      // Offline or blocked: local time-zone matches are still shown.
      if (err.name !== 'AbortError') {
        setStatus('City search is unavailable right now. Type a time zone instead, e.g. Europe/Berlin or UTC+3.');
        $('chosen').textContent = 'City search unavailable. Type a time zone (e.g. Asia/Tokyo) or an offset (UTC+3).';
      }
    }
  }, 300);
});

placeInput.addEventListener('keydown', (e) => {
  if (list.hidden || !suggestions.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  } else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    choose(suggestions[activeIdx]);
  } else if (e.key === 'Escape') {
    list.hidden = true;
  }
});

list.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) {
    e.preventDefault();
    choose(suggestions[+li.dataset.i]);
  }
});
placeInput.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));

function startEdit(person) {
  $('edit-id').value = person.id;
  $('name').value = person.name;
  placeInput.value = person.place || person.tz;
  chosen = { place: person.place, tz: person.tz };
  renderChosen();
  $('add-h').textContent = person.id === 'me' ? 'Edit yourself' : `Edit ${person.name}`;
  $('submit').textContent = 'Save';
  $('cancel-edit').hidden = false;
  $('person-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('name').focus({ preventScroll: true });
}

function resetForm() {
  $('person-form').reset();
  $('edit-id').value = '';
  chosen = null;
  renderChosen();
  list.hidden = true;
  $('add-h').textContent = 'Add a student';
  $('submit').textContent = 'Add';
  $('cancel-edit').hidden = true;
}
$('cancel-edit').addEventListener('click', resetForm);

$('person-form').addEventListener('submit', (e) => {
  e.preventDefault();
  let pick = chosen;
  if (!pick) {
    // Nothing picked from the list: accept a typed zone/offset, else the top suggestion.
    const q = placeInput.value;
    const direct = parseUtcOffsetZone(q) || (isValidTimeZone(q.trim()) && q.includes('/') ? q.trim() : null);
    if (direct) pick = { place: '', tz: direct };
    else if (suggestions.length) pick = { place: suggestions[0].place, tz: suggestions[0].tz };
  }
  if (!pick) {
    setStatus('Pick a place from the list (type a city, country or time zone).');
    placeInput.focus();
    return;
  }
  const name = $('name').value.trim().slice(0, 60);
  const id = $('edit-id').value;
  if (id === 'me') {
    state.me = { ...state.me, name, tz: pick.tz, place: pick.place };
  } else if (id) {
    const p = state.people.find((x) => x.id === id);
    if (p) Object.assign(p, { name, tz: pick.tz, place: pick.place });
  } else {
    state.people.push({ id: newId(), name, tz: pick.tz, place: pick.place });
  }
  save();
  resetForm();
  setStatus(`Saved ${name}.`);
  render();
});

// ---------- settings, share, backup ----------

let statusTimer = 0;
function setStatus(msg) {
  $('status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('status').textContent = ''; }, 5000);
}

$('hour12').addEventListener('change', (e) => {
  state.hour12 = e.target.checked;
  save();
  render();
});

function exportData() {
  return { me: state.me, people: state.people.map(({ name, tz, place }) => ({ name, tz, place })), hour12: state.hour12 };
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Copy text; falls back to execCommand where the Clipboard API is unavailable (e.g. file://). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

$('share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#data=${toBase64Url(JSON.stringify(exportData()))}`;
  if (await copyText(url)) setStatus('Link copied. Open it on another device to load this list.');
  else prompt('Copy this link:', url);
});

/** Plain-text list of everyone's local time, for pasting into a chat or email. */
function timesText(people, lessonHead, nowHead) {
  const t = now();
  const line = (p) => {
    const where = p.place || zoneLabel(p.tz) || formatOffset(offsetMinutes(t, p.tz));
    return `• ${p.name} (${where}): ${fmtTime(t, p.tz)}, ${fmtDate(t, p.tz)}`;
  };
  return [ref == null ? nowHead : lessonHead, ...people.map(line)].join('\n');
}

/** Copy text and briefly show "✓ Copied" on the button; show the text if copying is blocked. */
async function copyWithFeedback(btn, text) {
  if (!(await copyText(text))) {
    alert(text);
    return;
  }
  const label = btn.dataset.label ?? btn.textContent;
  btn.dataset.label = label;
  btn.textContent = '✓ Copied';
  clearTimeout(+btn.dataset.timer);
  btn.dataset.timer = setTimeout(() => {
    btn.textContent = label;
    delete btn.dataset.label;
  }, 2000);
}

$('copy-times').addEventListener('click', () => {
  const t = now();
  copyWithFeedback($('copy-times'), timesText([state.me, ...sortedPeople(t)],
    'Lesson time for everyone:', 'Current time for everyone:'));
});

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lesson-time-planner.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    replaceData(JSON.parse(await file.text()), 'backup file');
  } catch {
    setStatus('That file is not a valid backup.');
  }
});

function replaceData(raw, source) {
  const data = sanitize(raw);
  if (!data) {
    setStatus(`Could not read the ${source}.`);
    return;
  }
  const msg = `Load ${data.people.length} people from this ${source}? This replaces your current list` +
    (state.people.length ? ` of ${state.people.length}.` : '.');
  if (!confirm(msg)) return;
  state = data;
  save();
  setStatus(`Loaded ${data.people.length} people.`);
  render();
}

function importFromHash() {
  const m = /^#data=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    replaceData(JSON.parse(fromBase64Url(m[1])), 'link');
  } catch {
    setStatus('The share link is broken.');
  }
}

// ---------- theme ----------

const THEME_KEY = 'lesson-time-planner.theme';
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '🌓 Auto', light: '☀️ Light', dark: '🌙 Dark' };

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('theme').textContent = THEME_LABEL[theme];
  $('theme').setAttribute('aria-label', `Theme: ${theme}. Click to change.`);
}

$('theme').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'auto';
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  try {
    if (next === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch { /* storage blocked: theme still changes for this visit */ }
  applyTheme(next);
});
applyTheme(document.documentElement.dataset.theme || 'auto');

// ---------- start ----------

render();
importFromHash();

let lastMinute = Math.floor(Date.now() / 60000);
setInterval(() => {
  const minute = Math.floor(Date.now() / 60000);
  if (ref != null || minute === lastMinute) return;
  // Don't redraw while someone is typing a date into a row.
  if (document.activeElement?.matches('#people input')) return;
  lastMinute = minute;
  render();
}, 1000);
})();
