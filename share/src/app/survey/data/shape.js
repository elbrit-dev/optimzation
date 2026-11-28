/* THE CONTRACT — surveys as the ERP sends them, and the rules an answer
 * must meet. See SURVEYS_CONTEXT.md (repo root): §3 the questions, §4 the
 * rep-side API whose answers these screens read unchanged.
 *
 * What the screens add on top of the ERP's shapes (and nothing else):
 *   - a SURVEY per campaign (`surveysFromMyList`): `survey_my_list` sends one
 *     row per response plus `selftag` campaigns; the circles, the survey
 *     screen and its list are all per campaign;
 *   - a row's DISPLAY state: the ERP knows todo / done / missed; "Saved" is
 *     a todo with answers kept on this device (the ERP's own my-surveys page
 *     keeps drafts the same way — never on the server). */

/* §3 — the answer each type takes. */
export const QUESTION_TYPES = [
  'short_text',
  'paragraph',
  'number',
  'date',
  'multiple_choice',
  'dropdown',
  'checkboxes',
  'linear_scale',
  'rating',
  'file_upload',
  'map_location',
  'time',
  'days',
  'login',
  'timings',
  'repeat',
];

/* 27 Nov 2026 · Repeated group (type 'repeat'): a few questions (q.fields) answered again for every entry. The answer
   is a list of entries, each { <field id>: value }; an entry with nothing filled is left out. */
export const repeatNoun = (q) => String(q?.button || '').replace(/^\s*(add|\+)\s+(another|one more|a|an|more)?\s*/i, '').trim() || 'entry';
/* 27 Nov 2026 · an older answer or draft of a map question that is now a group with a map inside (a list of places,
   or one place) is read as entries of that map, so nothing typed before is lost */
/* "hospital or clinic" -> "hospitals or clinics" */
export const repeatPlural = (noun) => noun.split(' or ').map((w) => (/s$/.test(w) ? w : `${w}s`)).join(' or ');
export function repeatList(q, v) {
  const mk = (q?.fields ?? []).find((k) => k?.type === 'map_location');
  if (!mk) return v;
  const isPt = (r) => Boolean(r && typeof r === 'object' && !Array.isArray(r) && r.lat != null && r.lng != null && !(mk.id in r));
  if (isPt(v)) return [{ [mk.id]: v }];
  return Array.isArray(v) ? v.map((r) => (isPt(r) ? { [mk.id]: r } : r)) : v;
}
export const repeatRows = (v) => (Array.isArray(v) ? v.filter((r) => r && typeof r === 'object' && Object.values(r).some((x) => !isEmpty(x))) : []);
/* 25 Nov 2026 · Visiting timings — { place_id, place_name, days: { Monday: { state: open | closed | na,
   slots: [[HH:MM, HH:MM]] } }, source }, linked to the Map location question q.of */
export const TIMING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hm = (x) => (/^\d{2}:\d{2}$/.test(x || '') ? Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5)) : null);
export function timingDayError(v, d) {
  const x = v?.days?.[d] || {};
  if (x.state !== 'open') return '';
  const sl = x.slots || [];
  if (!sl.length) return 'Add a timing, or mark it Closed / Not available.';
  for (const s of sl) {
    const a = hm(s[0]);
    const b = hm(s[1]);
    if (a == null || b == null) return 'Enter both the start and the end time.';
    if (a === 0 && b >= 1439) return 'Google shows 24 hours — enter the doctor’s actual timings.';
    if (b <= a) return 'End time is before the start time.';
  }
  const o = sl.map((s) => [hm(s[0]), hm(s[1])]).sort((p, q) => p[0] - q[0]);
  for (let k = 1; k < o.length; k += 1) if (o[k][0] < o[k - 1][1]) return 'These timings overlap.';
  return '';
}
/* 26 Nov 2026 · a Separated map question: one timetable per chosen place (the answer is a list) */
function timingsProblem(q, v, answers) {
  const m = answers?.[q.of];
  if (Array.isArray(m)) {
    const P = m.filter((p) => p?.place_id);
    if (!P.length) return q.required ? 'Choose the places in the map question first.' : null;
    const list = Array.isArray(v) ? v : [];
    for (const p of P) {
      const one = list.find((x) => x?.place_id === p.place_id);
      const nm = P.length > 1 ? ` — ${p.name || 'a place'}` : '';
      if (!one?.days) return q.required ? `Wait for the timings to load${nm}.` : null;
      if (TIMING_DAYS.some((d) => timingDayError(one, d))) return `Fix the timings in red${nm}.`;
      if (q.required && !TIMING_DAYS.some((d) => one.days[d]?.state === 'open')) return `Add the timings for at least one day${nm}.`;
    }
    return null;
  }
  const pid = m?.place_id;
  if (!pid) return q.required ? 'Choose the place in the map question first.' : null;
  if (!v || !v.days || v.place_id !== pid) return q.required ? 'Wait for the timings to load.' : null;
  if (TIMING_DAYS.some((d) => timingDayError(v, d))) return 'Fix the timings in red.';
  if (q.required && !TIMING_DAYS.some((d) => v.days[d]?.state === 'open')) return 'Add the timings for at least one day.';
  return null;
}
export function timingsText(v) {
  if (Array.isArray(v)) return v.filter((x) => x?.days).map((x) => `${x.place_name || 'Place'}: ${timingsText(x)}`).join('\n');
  if (!v?.days) return '';
  return TIMING_DAYS.map((d) => {
    const x = v.days[d] || {};
    return `${d.slice(0, 3)} ${x.state === 'open' ? (x.slots || []).map((s) => `${s[0]}–${s[1]}`).join(', ') : x.state === 'na' ? 'Not available' : 'Closed'}`;
  }).join(' · ');
}


/* §3 map_location (24 Nov 2026) — the answer is a point:
   { lat, lng, place_id?, name?, address?, url?, how: same | place | pin | gps,
     was?: the record's point before, acc?: phone accuracy in metres }.
   q.lat / q.lng: where the map starts — the record's values (filled {#fields}). */
const num = (x) => {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : null;
};
export const mapIsPoint = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v) && num(v.lat) != null && num(v.lng) != null);
const okPoint = (a, b) => (a != null && b != null && (a || b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null);
/* one field holding both: {"x": lat, "y": lng} (Lead "Latitude and Longitude"), {lat, lng}, or "lat, lng" text */
export function mapParseLatLng(s) {
  const t = String(s ?? '').trim();
  if (!t || t === '—') return null;
  let a = null;
  let b = null;
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t);
      a = num(o.x ?? o.lat ?? o.latitude);
      b = num(o.y ?? o.lng ?? o.longitude);
    } catch {
      /* not JSON */
    }
  }
  if (a == null || b == null) {
    const m = t.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      a = num(m[1]);
      b = num(m[2]);
    }
  }
  if (a != null && b != null && Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a];
  return okPoint(a, b);
}
/* the record's point: its latitude / longitude fields, else the field holding both (q.latlng) */
export function mapStart(q) {
  return okPoint(num(q?.lat), num(q?.lng)) ?? mapParseLatLng(q?.latlng);
}
export function mapMeters(a, b) {
  const r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r;
  const dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export const mapDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
export function mapMoved(v) {
  if (!mapIsPoint(v) || v.how === 'same' || !mapIsPoint(v.was)) return '';
  const m = mapMeters({ lat: +v.was.lat, lng: +v.was.lng }, { lat: +v.lat, lng: +v.lng });
  return m < 5 ? 'Same point as before' : `Moved ${mapDist(m)} from the location on record`;
}
export function mapText(v) {
  if (!mapIsPoint(v)) return '';
  if (v.how === 'same') return 'Location on record is correct';
  const nm = v.name || 'Pinned on the map';
  const kind = v.kind && !nm.toLowerCase().includes(String(v.kind).toLowerCase().split(' ')[0]) ? ` (${v.kind})` : '';
  /* 28 Nov 2026 · pharmacy mapping: the distributor the rep chose */
  const sv = v.serving ? ` · Distributor: ${v.serving.none ? 'not sure' : v.serving.label || v.serving.customer}` : '';
  return `${nm}${kind}${v.address ? ` — ${v.address}` : ''}${sv}`;
}
export const mapUrl = (v) =>
  v.url && v.how === 'place'
    ? v.url
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${(+v.lat).toFixed(7)},${(+v.lng).toFixed(7)}`)}`;

/* §3 file_upload `accept` — the label shown and the extensions allowed
   ([] = any safe file). Same table as the ERP page and Submit Response. */
export const FILE_KINDS = {
  pdf_image: { label: 'PDF or image', exts: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] },
  pdf: { label: 'PDF', exts: ['pdf'] },
  image: { label: 'Image', exts: ['jpg', 'jpeg', 'png', 'webp', 'heic'] },
  office: { label: 'PDF, Word or Excel', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'] },
  any: { label: 'Any file', exts: [] },
};
/* Never accepted, even for "Any file" (the server refuses them too). */
export const BLOCKED_EXT = ['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'sh', 'ps1', 'js', 'vbs', 'jar', 'html', 'htm', 'svg', 'php', 'py'];

export function fileRules(q) {
  const kind = FILE_KINDS[q.accept] ?? FILE_KINDS.pdf_image;
  return { label: kind.label, exts: kind.exts, maxMb: Number(q.max_mb) || 5, maxFiles: Number(q.max_files) || 1 };
}

const ext = (name) => (String(name ?? '').includes('.') ? String(name).split('.').pop().toLowerCase() : '');

/* Why this file cannot go on this question, or null. Checked before the
   upload starts, as §4 asks. */
export function fileProblem(q, file) {
  const r = fileRules(q);
  const e = ext(file.name);
  if (BLOCKED_EXT.includes(e) || (r.exts.length && !r.exts.includes(e))) return `“${file.name}” is not a ${r.label}.`;
  if (file.size > r.maxMb * 1024 * 1024) return `“${file.name}” is larger than ${r.maxMb} MB.`;
  return null;
}

export function scaleRange(q) {
  if (q.type === 'rating') return { min: 1, max: Number(q.max) || 5 };
  return { min: Number(q.min) === 0 ? 0 : 1, max: Number(q.max) || 5 };
}

export function isEmpty(v) {
  return v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

/* 27 Nov 2026 · answered = something usable is there. Visiting timings with a day still to fill (an Open day with no
   times, end before start …) is not answered yet — it no longer says "Answered" or counts as done while red. */
export function isAnswered(q, v) {
  if (isEmpty(v)) return false;
  if (q?.type === 'timings') {
    const one = (x) => Boolean(x && x.days) && TIMING_DAYS.every((d) => !timingDayError(x, d));
    return Array.isArray(v) ? v.length > 0 && v.every(one) : one(v);
  }
  if (q?.type === 'repeat') return repeatRows(repeatList(q, v)).length > 0 && !answerProblem(q, v);
  return true;
}

/* The message under a question, or null — the ERP page's words, so the app
   and the ERP say the same thing. The server re-checks all of it. */
/* 26 Nov 2026 · Login: "Any exceptions?" (required). OTP / Mail / Other count as the reason when not verified. */
export const LOGIN_EXCEPTIONS = ['No exceptions', 'OTP required', 'Mail required', 'Other'];
export function loginExceptions(v) {
  return Array.isArray(v?.exceptions) ? v.exceptions.filter((x) => LOGIN_EXCEPTIONS.includes(x)) : [];
}

export function answerProblem(q, v, answers) {
  if (q.type === 'erp_info') return null; /* 26 Nov 2026 · "Show from ERP": read-only, nothing to answer */
  if (q.type === 'timings') return timingsProblem(q, v, answers);
  if (q.type === 'repeat') return repeatProblem(q, v);
  if (isEmpty(v)) {
    if (!q.required) return null;
    if (q.type === 'file_upload') return 'Please upload a file to continue.';
    if (q.type === 'checkboxes' || q.type === 'days') return 'Please choose at least one option to continue.';
    if (q.type === 'map_location') return q.multi ? (q.places === 'pharmacy' ? 'Please choose at least one pharmacy on the map to continue.' : 'Please choose at least one hospital or clinic on the map to continue.') : q.places === 'pharmacy' ? 'Please choose the pharmacy on the map to continue.' : 'Please choose the hospital or clinic on the map to continue.';
    return 'Please answer this question to continue.';
  }
  if (q.type === 'number' && !/^-?\d+(\.\d+)?$/.test(String(v).trim())) return 'Please enter a number, for example 12 or 4.5.';
  if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Please enter a valid date.';
  if (q.type === 'login' && (!String(v.url ?? '').trim() || !String(v.login ?? '').trim() || !String(v.password ?? '').trim())) return 'Please fill the website URL, login ID and password.';
  if (q.type === 'login' && !v.test) return 'Test the login before sending.';
  if (q.type === 'login' && !loginExceptions(v).length) return 'Say if there are any exceptions (OTP required, Mail required …).';
  if (q.type === 'login' && loginExceptions(v).includes('Other') && !String(v.reason ?? '').trim()) return 'Write the other exception in the note.';
  if (q.type === 'login' && v.test.result !== 'verified' && !String(v.reason ?? '').trim() && !loginExceptions(v).some((x) => x !== 'No exceptions')) return 'Say why the login isn’t verified — pick OTP required / Mail required, or write a note.';
  if (q.type === 'time' && !(q.range ? /^\d{2}:\d{2}-\d{2}:\d{2}$/ : /^\d{2}:\d{2}$/).test(String(v))) return q.range ? 'Please enter both the start and the end time.' : 'Please enter a valid time.';
  if ((q.type === 'multiple_choice' || q.type === 'dropdown') && !(q.options ?? []).includes(v)) return 'Please choose one of the options.';
  if (q.type === 'linear_scale' || q.type === 'rating') {
    const { min, max } = scaleRange(q);
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return `Please choose a value from ${min} to ${max}.`;
  }
  if (q.type === 'file_upload' && v.length > fileRules(q).maxFiles) return `You can add up to ${fileRules(q).maxFiles} file(s) here.`;
  /* 26 Nov 2026 · Survey Studio "Redo": a file the AI found not Clear must be uploaded again */
  if (q.type === 'file_upload' && v.some((f) => f?.ai?.redo)) return 'A file is not clear — remove it and upload it again.';
  /* 28 Nov 2026 · the AI check flagged something on a file: say why */
  if (q.type === 'file_upload' && v.some((f) => aiFlags(f).length && !String(f?.ai?.reason ?? '').trim())) return 'Write why for the flags on the file.';
  /* 28 Nov 2026 · pharmacy mapping: which distributor serves the pharmacy */
  if (q.type === 'map_location' && q.serving && q.places === 'pharmacy' && (Array.isArray(v) ? v : [v]).some((x) => mapIsPoint(x) && !x.serving)) return 'Choose which distributor serves the pharmacy.';
  return null;
}

/* 28 Nov 2026 · every upload the AI reads: the rep sees what was read and can correct it (no reason needed); the AI
   check's FLAGS — lines that aren't Elbrit (or no Elbrit medicine), a check that didn't pass, something not found —
   need a reason ("Why?") before Submit. The flags, the reason and the corrections go with the file as `check`. */
const AI_HIDDEN = (k) => k.startsWith('_') || k === 'elbrit_summary' || k === 'parts_failed' || /^check_/.test(k);
const aiWord = (k) => String(k).replace(/_/g, ' ');
export function aiFlags(f) {
  const ai = f?.ai;
  if (!ai || !ai.fields || typeof ai.fields !== 'object') return [];
  const fields = ai.fields;
  const out = [];
  const el = fields.elbrit_summary && typeof fields.elbrit_summary === 'object' ? fields.elbrit_summary : null;
  if (el && el.lines) {
    if (!el.elbrit) out.push(`No Elbrit medicine found (${el.lines} ${el.lines === 1 ? 'line' : 'lines'} read)`);
    else if (el.others) {
      const names = [];
      for (const [k, rows] of Object.entries(fields)) {
        if (AI_HIDDEN(k) || !Array.isArray(rows)) continue;
        for (const r of rows) {
          if (!r || typeof r !== 'object' || r.elbrit_product) continue;
          const t = Object.entries(r).find(([c, x]) => c !== 'elbrit_product' && typeof x === 'string' && /[A-Za-z]/.test(x));
          if (t && names.length < 6) names.push(t[1]);
        }
      }
      out.push(`${el.others} ${el.others === 1 ? "line isn't" : "lines aren't"} Elbrit${names.length ? `: ${names.join(', ')}` : ''}`);
    }
  }
  if (ai.state === 'clerk' && String(ai.why || '').trim()) out.push(`AI check: ${String(ai.why).trim()}`);
  const missing = Object.entries(fields).filter(([k, x]) => !AI_HIDDEN(k) && !Array.isArray(x) && (x == null || String(x).trim() === '')).map(([k]) => aiWord(k));
  if (missing.length) out.push(`Not found: ${missing.join(', ')}`);
  return out;
}
/* what the rep corrected: {fields: {key: [old, new]}, rows: [[index, product, column, old, new]]} */
export function aiEdits(f) {
  const ai = f?.ai;
  const now = ai?.fields, was = ai?.orig;
  if (!now || !was) return null;
  const fields = {};
  const rows = [];
  for (const [k, v] of Object.entries(now)) {
    if (AI_HIDDEN(k)) continue;
    if (Array.isArray(v)) {
      const old = Array.isArray(was[k]) ? was[k] : [];
      v.forEach((r, i) => {
        if (!r || typeof r !== 'object') return;
        const o = old[i] && typeof old[i] === 'object' ? old[i] : {};
        const name = r.elbrit_product || Object.values(r).find((x) => typeof x === 'string' && /[A-Za-z]/.test(x)) || '';
        for (const c of Object.keys(r)) {
          if (c === 'elbrit_product') continue;
          const a = o[c] == null ? '' : String(o[c]), b = r[c] == null ? '' : String(r[c]);
          if (a !== b) rows.push([i, String(name), c, a, b]);
        }
      });
    } else {
      const a = was[k] == null ? '' : String(was[k]), b = v == null ? '' : String(v);
      if (a !== b) fields[k] = [a, b];
    }
  }
  return Object.keys(fields).length || rows.length ? { fields, rows } : null;
}
export function aiCheck(f) {
  if (!f?.ai) return null;
  const flags = aiFlags(f);
  const reason = String(f.ai.reason ?? '').trim();
  const edits = aiEdits(f);
  const out = {};
  if (flags.length) out.flags = flags;
  if (reason) out.reason = reason;
  if (edits) out.edits = edits;
  return Object.keys(out).length ? out : null;
}
const fileOut = (f) => {
  const c = aiCheck(f);
  return { url: f.url, name: f.name, size: f.size || 0, ...(c ? { check: c } : {}) };
};

/* 27 Nov 2026 · a Repeated group: enough entries, and every required question in every entry answered */
function repeatProblem(q, v) {
  const lv = repeatList(q, v);
  const rows = Array.isArray(lv) ? lv : [];
  const filled = repeatRows(rows);
  const noun = repeatNoun(q);
  const min = Math.max(q.required ? 1 : 0, Number(q.min) || 0);
  if (!filled.length) return min ? (min > 1 ? `Add at least ${min} ${repeatPlural(noun)} to continue.` : `Add at least one ${noun} to continue.`) : null;
  if (filled.length < min) return `Add at least ${min} ${repeatPlural(noun)} to continue.`;
  if (q.max && filled.length > q.max) return `You can add up to ${q.max} ${repeatPlural(noun)} here.`;
  let n = 0;
  for (const r of rows) {
    if (!filled.includes(r)) continue;
    n += 1;
    for (const k of q.fields ?? []) {
      const p = answerProblem(k, r[k.id]);
      if (p) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${n} · ${k.label}: ${p}`;
    }
  }
  return null;
}

/* Every question's problem, keyed by id — empty when the form may be sent. */
export function formProblems(questions, answers) {
  const out = {};
  for (const q of questions) {
    const p = answerProblem(q, answers?.[q.id], answers);
    if (p) out[q.id] = p;
  }
  return out;
}

/* The answers as survey_submit_response takes them (§4): files as
   {url, name, size}, numbers as numbers, nothing for an unanswered one. */
export function toPayload(questions, answers) {
  const out = {};
  for (const q of questions) {
    const v = answers?.[q.id];
    if (isEmpty(v)) continue;
    if (q.type === 'file_upload') out[q.id] = v.map(fileOut);
    else if (q.type === 'number') out[q.id] = Number(v);
    else if (q.type === 'repeat') {
      const rows = repeatRows(repeatList(q, v)).map((r) => {
        const one = {};
        for (const k of q.fields ?? []) {
          const x = r[k.id];
          if (isEmpty(x)) continue;
          one[k.id] = k.type === 'file_upload' ? x.map(fileOut) : k.type === 'number' ? Number(x) : x;
        }
        return one;
      });
      if (rows.length) out[q.id] = rows;
    }
    else out[q.id] = v;
  }
  return out;
}

/* One answer as a line of text — done and missed responses, read-only. */
export function answerText(q, v) {
  if (isEmpty(v)) return '—';
  if (q.type === 'checkboxes' || q.type === 'days') return v.join(', ');
  if (q.type === 'login') {
    const ex = loginExceptions(v), note = String(v.reason ?? '').trim();
    return [v.url, v.login, v.password].filter(Boolean).join(' · ') + (v.verified || v.test?.result === 'verified' ? ' · Verified' : v.test ? ' · Not verified' : '') + (ex.length ? ` · ${ex.join(', ')}` : '') + (note ? ` — ${note}` : '');
  }
  if (q.type === 'timings') return timingsText(v);
  if (q.type === 'repeat') {
    const rows = repeatRows(repeatList(q, v));
    if (!rows.length) return '—';
    return rows
      .map((r, i) => `${i + 1}. ${(q.fields ?? []).map((k) => (isEmpty(r[k.id]) ? '' : answerText(k, r[k.id]))).filter(Boolean).join(' · ')}`)
      .join('\n');
  }
  if (q.type === 'file_upload') return v.map((f) => f.name + (f.check?.reason ? ` (why: ${f.check.reason})` : '')).join(', ');
  if (q.type === 'map_location') return Array.isArray(v) ? v.map(mapText).filter(Boolean).join('\n') : mapText(v); /* 26 Nov 2026: Separated — a list */
  if (q.type === 'rating') return `${v} of ${scaleRange(q).max} stars`;
  if (q.type === 'linear_scale') return `${v} (scale ${scaleRange(q).min}–${scaleRange(q).max})`;
  return String(v);
}

/* ---- surveys, per campaign ---- */

/* §3 settings.target, as the screens name the people in a survey. */
export const TARGET = {
  Doctor: { one: 'doctor', many: 'doctors', Many: 'Doctors' },
  Distributor: { one: 'distributor', many: 'distributors', Many: 'Distributors' },
  Employees: { one: 'person', many: 'people', Many: 'Employees' },
};
/* A survey about another DocType or a list ("DocType" target): its own noun,
   as Survey Center named it (about.noun, e.g. "chemist" / "supplier"). */
export const targetOf = (t, about) => {
  if (t === 'DocType') {
    const one = String(about?.noun || about?.label || about?.doctype || 'record').trim().toLowerCase() || 'record';
    const many = /s$/.test(one) ? one : `${one}s`;
    return { one, many, Many: many.charAt(0).toUpperCase() + many.slice(1) };
  }
  return TARGET[t] ?? TARGET.Employees;
};

/* A row's state on screen: the ERP's state, with a todo that has a draft on
   this device shown as "Saved". */
export const ROW_LABEL = { new: 'Not started', draft: 'Saved', done: 'Submitted', missed: 'Missed', returned: 'Returned' };
export const ROW_TONE = { new: 'neutral', draft: 'warning', done: 'success', missed: 'neutral', returned: 'danger' };

export function rowState(r, drafts) {
  if (r.state === 'done') return 'done';
  if (r.state === 'missed') return 'missed';
  return drafts?.[r.response] ? 'draft' : 'new';
}

/* survey_my_list → one survey per campaign:
 *   { campaign, title, description, due_date, from, questions, target,
 *     survey_type, tagging, rows: [response rows], selfTag, open, state }
 * `state`: todo (something left, still open), done (every row submitted),
 * missed (closed with something unsent). A Self-tag campaign that is still
 * open comes in `selftag` even before any response exists. */
export function surveysFromMyList(list) {
  const by = new Map();
  const get = (src) => {
    if (!by.has(src.campaign)) {
      by.set(src.campaign, {
        campaign: src.campaign,
        title: src.title,
        description: src.description ?? '',
        due_date: src.due_date ?? null,
        from: src.from ?? '',
        questions: src.questions ?? [],
        target: src.target || 'Employees',
        survey_type: src.survey_type ?? '',
        tagging: src.tagging ?? '',
        /* Survey Center's additions: an announcement (kind + its message),
           what a DocType / list survey is about, and the View above the
           questions. Each row keeps its own `values` for the {#fields}. */
        kind: src.kind === 'announcement' ? 'announcement' : 'survey',
        announcement: src.announcement ?? null,
        about: src.about ?? null,
        summary: src.summary ?? '',
        /* 27 Nov 2026 · Survey Studio: how this employee gets records, the limits, the card's fields */
        studio: src.studio ?? null,
        rows: [],
        selfTagOpen: false,
      });
    }
    return by.get(src.campaign);
  };
  for (const r of list?.surveys ?? []) {
    const g = get(r);
    g.rows.push(r);
    if (!g.summary && r.summary) g.summary = r.summary;
    if (!g.about && r.about) g.about = r.about;
    if (!g.studio && r.studio) g.studio = r.studio;
  }
  for (const s of list?.selftag ?? []) {
    const g = get({ ...s, tagging: 'Self-tag' });
    g.tagging = 'Self-tag';
    g.selfTagOpen = true;
  }
  return [...by.values()].map((g) => {
    const left = g.rows.filter((r) => r.state === 'todo').length;
    const done = g.rows.filter((r) => r.state === 'done').length;
    const missed = g.rows.filter((r) => r.state === 'missed').length;
    /* Something to answer; or an open Self-tag survey nobody was added to
       yet. An open Self-tag survey whose added rows are all sent counts as
       done — more can still be added (`open`). */
    let state = 'done';
    if (left > 0 || (g.selfTagOpen && g.rows.length === 0)) state = 'todo';
    else if (missed > 0) state = 'missed';
    const open = g.selfTagOpen || left > 0;
    return { ...g, left, done, missed, total: g.rows.length, open, state, selfTag: g.tagging === 'Self-tag' };
  });
}

/* Days from today to the due date (negative once past). */
export function daysLeft(today, due) {
  if (!today || !due) return null;
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(d) {
  if (!d) return '';
  return `${Number(String(d).slice(8, 10))} ${MONTHS[Number(String(d).slice(5, 7)) - 1] ?? ''}`;
}

export function dueText(today, due) {
  const n = daysLeft(today, due);
  if (n == null) return 'No due date';
  if (n < 0) return `Overdue · was due ${shortDate(due)}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due ${shortDate(due)} · ${n} days`;
}

/* The circle's label: the title's first one or two words, trimmed to fit
   under a 56px ring. The full title goes in the tile's aria-label. */
/* 26 Nov 2026 · short names that tell surveys apart. When titles give the same short name, the words they share
   at the start / end are dropped ("ZZ Test – Prescription" / "ZZ Test – Distributor login" → "Prescripti…" /
   "Distributor"), again inside any group still the same; what is still the same is numbered. */
export function distinctNames(titles, max = 11) {
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const words = titles.map((t) => String(t ?? '').replace(/[—–:|()-]+/g, ' ').split(/\s+/).filter(Boolean));
  const names = titles.map((t) => shortName(t, max));
  for (let pass = 0; pass < 3; pass += 1) {
    const groups = {};
    names.forEach((n, i) => { (groups[n] = groups[n] || []).push(i); });
    let moved = false;
    Object.values(groups).forEach((idx) => {
      if (idx.length < 2) return;
      const W = idx.map((i) => words[i]);
      let p = 0;
      while (W.every((w) => p < w.length && eq(w[p], W[0][p]))) p += 1;
      let q = 0;
      while (W.every((w) => q < w.length - p && eq(w[w.length - 1 - q], W[0][W[0].length - 1 - q]))) q += 1;
      if (!p && !q) return;
      idx.forEach((i) => {
        const mid = words[i].slice(p, words[i].length - q);
        if (mid.length) { words[i] = mid; names[i] = shortName(mid.join(' '), max); moved = true; }
      });
    });
    if (!moved) break;
  }
  const count = {};
  names.forEach((n) => { count[n] = (count[n] || 0) + 1; });
  const at = {};
  return names.map((n) => {
    if (count[n] < 2) return n;
    at[n] = (at[n] || 0) + 1;
    return `${n.length > max - 2 ? `${n.slice(0, max - 3)}…` : n} ${at[n]}`;
  });
}

export function shortName(title, max = 11) {
  const words = String(title ?? '').replace(/[—–:|(].*$/, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Survey';
  const two = words.slice(0, 2).join(' ');
  const pick = two.length <= max ? two : words[0];
  return pick.length <= max ? pick : `${pick.slice(0, max - 1)}…`;
}
