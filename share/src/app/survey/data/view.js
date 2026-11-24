/* THE VIEW, AND {#field} PLACEHOLDERS — as the ERP's own My Surveys page
 * shows them (Survey Center writes them; survey_my_list sends them).
 *
 *   summary   the survey's VIEW: a short HTML (or **simple marks**) header
 *             shown above the questions — why the survey is, and which
 *             doctor / account / record it is about. One per survey.
 *   values    per response: the record's values for every {#field} the
 *             survey uses (the employee's own, for a General survey).
 *   {#survey_title} {#survey_description} {#survey_due}  the survey itself.
 *
 * The HTML is CLEANED here before it is shown — a short list of tags, no
 * scripts / styles / event handlers, safe inline styles only, links only
 * https / mailto / tel, images only https. Every value is escaped. Same
 * rules as the ERP page (Survey Center view.js), so both show the same. */

const TAGS = new Set(['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'div', 'span', 'section', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'img']);
const VOID = new Set(['br', 'hr', 'img']);
const STYLE = /^(color|background|background-color|font-weight|font-style|font-size|text-align|text-decoration|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?|border(-(top|right|bottom|left))?(-(width|style|color))?|border-radius|border-collapse|width|max-width|line-height|vertical-align)$/i;

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function attrs(tag, raw) {
  const out = [];
  const re = /([a-zA-Z][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(raw || ''))) {
    const k = m[1].toLowerCase();
    const v = String((m[3] ?? m[4] ?? m[5]) || '').trim();
    const q = (x) => ` ${k}="${x.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    if (k === 'href' && tag === 'a') {
      if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) out.push(`${q(v)} target="_blank" rel="noopener noreferrer"`);
    } else if (k === 'src' && tag === 'img') {
      if (/^https:\/\//i.test(v)) out.push(q(v));
    } else if (k === 'alt' || k === 'title') out.push(q(v));
    else if ((k === 'colspan' || k === 'rowspan') && /^\d{1,2}$/.test(v)) out.push(q(v));
    else if (k === 'align' && /^(left|right|center)$/i.test(v)) out.push(q(v));
    else if (k === 'style') {
      const st = v
        .split(';')
        .map((d) => {
          const i = d.indexOf(':');
          return i > 0 ? [d.slice(0, i).trim(), d.slice(i + 1).trim()] : null;
        })
        .filter((p) => p && STYLE.test(p[0]) && p[1] && !/url\s*\(|expression|javascript|@import|[<>"\\]/i.test(p[1]))
        .map((p) => `${p[0].toLowerCase()}: ${p[1]}`)
        .join('; ');
      if (st) out.push(q(st));
    }
  }
  return out.join('');
}

/* Any HTML → only the allowed tags and attributes, every tag closed. */
export function safeHtml(src) {
  const s = String(src || '')
    .replace(/<(script|style|iframe|object|embed|template|noscript|textarea|select|svg|math|form|button|input)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  const open = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  const txt = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    out.push(txt(s.slice(last, m.index)));
    last = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (m[1]) {
      const k = open.lastIndexOf(tag);
      if (k >= 0) while (open.length > k) out.push(`</${open.pop()}>`);
      continue;
    }
    out.push(`<${tag}${attrs(tag, m[3])}>`);
    if (!VOID.has(tag)) open.push(tag);
  }
  out.push(txt(s.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

/* **bold**, *italic*, [text](https://…), # headings, - / 1. lists — the
   ERP's announcement / question-description marks. Escaped first. */
export function markdownHtml(src) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m0, a, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  const out = [];
  let list = null;
  let para = [];
  const flushP = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushL = () => {
    if (list) {
      out.push(`<${list.t}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.t}>`);
      list = null;
    }
  };
  String(src || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line) => {
      const hm = line.match(/^\s*(#{1,3})\s+(.*)$/);
      if (hm) {
        flushP();
        flushL();
        out.push(`<h${hm[1].length + 2}>${inline(hm[2])}</h${hm[1].length + 2}>`);
        return;
      }
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushP();
        const t = ul ? 'ul' : 'ol';
        if (!list || list.t !== t) {
          flushL();
          list = { t, items: [] };
        }
        list.items.push((ul || ol)[1]);
      } else if (!line.trim()) {
        flushP();
        flushL();
      } else {
        flushL();
        para.push(line);
      }
    });
  flushP();
  flushL();
  return out.join('');
}

const looksHtml = (s) => /<\/?(p|br|hr|h[1-6]|b|strong|i|em|u|ul|ol|li|div|span|section|table|thead|tbody|tr|td|th|a|img|blockquote|small|code|pre|mark)\b[^<>]*>/i.test(String(s || ''));

/* An announcement's message (HTML or simple marks) as safe HTML. */
export const messageHtml = (src) => (looksHtml(src) ? safeHtml(src) : markdownHtml(src));

const TAG = /\{#\s*(\w+)\s*\}/g;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayText(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[dt.getUTCDay()]}, ${+m[3]} ${MONTHS[+m[2] - 1]}`;
}
export const SURVEY_TAGS = ['survey_title', 'survey_description', 'survey_due'];

/* One placeholder's value for this response: the survey's own, or the
   record's ('' when there is none). */
export function tagValue(survey, row, key) {
  if (key === 'survey_title') return survey?.title || '';
  if (key === 'survey_description') return survey?.description || '';
  if (key === 'survey_due') return survey?.due_date ? dayText(survey.due_date) : '';
  const v = row?.values?.[key];
  return v == null ? '' : String(v);
}

/* Text with its placeholders filled ("—" for an empty record value). */
export function fillText(text, survey, row) {
  if (typeof text !== 'string' || !text.includes('{#')) return text;
  return text.replace(TAG, (m, k) => tagValue(survey, row, k) || (SURVEY_TAGS.includes(k) ? '' : '—'));
}

/* The questions this response shows: labels, descriptions and options
   with the record's values — what the ERP page does (fillTags). */
export function filledQuestions(survey, row) {
  const qs = survey?.questions ?? [];
  if (!JSON.stringify(qs).includes('{#')) return qs;
  const f = (x) => fillText(x, survey, row);
  return qs.map((q) => ({
    ...q,
    label: f(q.label),
    description: f(q.description),
    options: Array.isArray(q.options) ? q.options.map(f) : q.options,
    min_label: f(q.min_label),
    max_label: f(q.max_label),
    /* map_location: where the map starts — the record's own location */
    ...(q.lat != null ? { lat: f(q.lat) } : {}),
    ...(q.lng != null ? { lng: f(q.lng) } : {}),
    ...(q.latlng != null ? { latlng: f(q.latlng) } : {}),
  }));
}

/* The View for this response, as safe HTML — '' when the survey has none.
   Values are escaped; an empty survey value shows nothing, an empty record
   value "Not on record" (muted). */
export function viewHtml(survey, row) {
  const src = String(survey?.summary || '').trim();
  if (!src) return '';
  const html = looksHtml(src) ? safeHtml(src) : markdownHtml(src);
  /* an empty record value says so (muted) — a bare "—" read like a mistake */
  return html.replace(TAG, (m, k) => {
    const v = tagValue(survey, row, k);
    if (v) return escapeHtml(v);
    return SURVEY_TAGS.includes(k) ? '' : '<span class="vw-na">Not on record</span>';
  });
}
