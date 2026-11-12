/* THE CONTRACT — surveys as the ERP sends them, and the rules an answer
 * must meet. See SURVEYS_CONTEXT.md (repo root): §3 the questions, §4 the
 * rep-side API whose answers these screens read unchanged.
 *
 * What the screens add on top of the ERP's shapes (and nothing else):
 *   - a SURVEY per campaign (`surveysFromMyList`): `survey_my_list` sends one
 *     row per response plus `selftag` campaigns; the circles, the survey
 *     screen and its list are all per campaign;
 *   - a row's DISPLAY state: the ERP knows todo / done / missed; "Draft" is
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
];

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

/* The message under a question, or null — the ERP page's words, so the app
   and the ERP say the same thing. The server re-checks all of it. */
export function answerProblem(q, v) {
  if (isEmpty(v)) {
    if (!q.required) return null;
    if (q.type === 'file_upload') return 'Please upload a file to continue.';
    if (q.type === 'checkboxes') return 'Please choose at least one option to continue.';
    return 'Please answer this question to continue.';
  }
  if (q.type === 'number' && !/^-?\d+(\.\d+)?$/.test(String(v).trim())) return 'Please enter a number, for example 12 or 4.5.';
  if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Please enter a valid date.';
  if ((q.type === 'multiple_choice' || q.type === 'dropdown') && !(q.options ?? []).includes(v)) return 'Please choose one of the options.';
  if (q.type === 'linear_scale' || q.type === 'rating') {
    const { min, max } = scaleRange(q);
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return `Please choose a value from ${min} to ${max}.`;
  }
  if (q.type === 'file_upload' && v.length > fileRules(q).maxFiles) return `You can add up to ${fileRules(q).maxFiles} file(s) here.`;
  return null;
}

/* Every question's problem, keyed by id — empty when the form may be sent. */
export function formProblems(questions, answers) {
  const out = {};
  for (const q of questions) {
    const p = answerProblem(q, answers?.[q.id]);
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
    if (q.type === 'file_upload') out[q.id] = v.map((f) => ({ url: f.url, name: f.name, size: f.size || 0 }));
    else if (q.type === 'number') out[q.id] = Number(v);
    else out[q.id] = v;
  }
  return out;
}

/* One answer as a line of text — done and missed responses, read-only. */
export function answerText(q, v) {
  if (isEmpty(v)) return '—';
  if (q.type === 'checkboxes') return v.join(', ');
  if (q.type === 'file_upload') return v.map((f) => f.name).join(', ');
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
export const targetOf = (t) => TARGET[t] ?? TARGET.Employees;

/* A row's state on screen: the ERP's state, with a todo that has a draft on
   this device shown as "Draft". */
export const ROW_LABEL = { new: 'Not started', draft: 'Draft', done: 'Submitted', missed: 'Missed' };
export const ROW_TONE = { new: 'neutral', draft: 'warning', done: 'success', missed: 'neutral' };

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
        rows: [],
        selfTagOpen: false,
      });
    }
    return by.get(src.campaign);
  };
  for (const r of list?.surveys ?? []) get(r).rows.push(r);
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
export function shortName(title, max = 11) {
  const words = String(title ?? '').replace(/[—–:|(].*$/, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Survey';
  const two = words.slice(0, 2).join(' ');
  const pick = two.length <= max ? two : words[0];
  return pick.length <= max ? pick : `${pick.slice(0, max - 1)}…`;
}
