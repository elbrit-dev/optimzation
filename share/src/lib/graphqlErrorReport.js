/**
 * Structured console reporting for GraphQL / Frappe failures.
 *
 * A bad GraphQL call against Frappe comes back as HTTP 400 whose *body* carries
 * the real cause — GraphQL `errors[]` with source locations, or a Frappe
 * `exception` plus an `exc` traceback and `_server_messages`. The browser's own
 * "POST …/api/method/graphql 400 (Bad Request)" line shows none of that, and
 * call sites that only rethrow `HTTP ${status}` drop the body on the floor.
 *
 * Every GraphQL call site funnels its failures through here, so one readable
 * console group replaces the bare status line.
 *
 * Safe in workers and in Node — nothing here touches the DOM, and a reporting
 * failure never masks the original error.
 */

const MAX_RAW_CHARS = 4000;
const QUERY_CONTEXT_LINES = 2;

// ─── Body parsing ─────────────────────────────────────────────────────────────

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function stripHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/** Frappe ships `_server_messages` as a JSON string holding an array of JSON strings. */
function readServerMessages(raw) {
  const outer = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!Array.isArray(outer)) return [];
  return outer
    .map((entry) => {
      const parsed = typeof entry === 'string' ? safeParse(entry) : entry;
      return stripHtml(parsed?.message ?? entry);
    })
    .filter(Boolean);
}

/** Frappe ships `exc` as a JSON string holding an array of traceback strings. */
function readTraceback(body) {
  if (typeof body?.exception === 'string' && body.exception.includes('Traceback')) {
    return body.exception;
  }
  const exc = typeof body?.exc === 'string' ? safeParse(body.exc) : body?.exc;
  if (Array.isArray(exc)) return exc.join('\n');
  if (typeof exc === 'string') return exc;
  return null;
}

/** Pull every human-readable message the body offers, most specific first. */
function readMessages(body) {
  if (!body || typeof body !== 'object') return [];

  if (Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map((e) => stripHtml(e?.message ?? JSON.stringify(e)));
  }

  const server = readServerMessages(body._server_messages);
  if (server.length) return server;

  for (const key of ['exception', 'message', 'error']) {
    if (typeof body[key] === 'string' && body[key].trim()) {
      // `exception` is usually "frappe.exceptions.ValidationError: real message"
      const text = stripHtml(body[key]);
      const colon = key === 'exception' ? text.indexOf(': ') : -1;
      return [colon > 0 ? text.slice(colon + 2) : text];
    }
  }
  return [];
}

function readExcType(body) {
  if (typeof body?.exc_type === 'string') return body.exc_type;
  if (typeof body?.exception === 'string') {
    const match = body.exception.match(/^([\w.]+Error|[\w.]*Exception)\b/);
    if (match) return match[1];
  }
  return null;
}

/** GraphQL errors carry `locations`/`path`; keep them for the query excerpt. */
function readLocations(body) {
  if (!Array.isArray(body?.errors)) return [];
  return body.errors.flatMap((e) => e?.locations ?? []);
}

// ─── Query excerpt ────────────────────────────────────────────────────────────

/**
 * Render the offending query line with two lines of context and a caret,
 * so a `locations: [{line: 12, column: 5}]` becomes something readable.
 */
function queryExcerpt(query, locations) {
  const loc = locations?.[0];
  if (!query || !loc?.line) return null;

  const lines = String(query).split('\n');
  const target = loc.line - 1;
  if (target < 0 || target >= lines.length) return null;

  const from = Math.max(0, target - QUERY_CONTEXT_LINES);
  const to = Math.min(lines.length, target + QUERY_CONTEXT_LINES + 1);
  const gutter = String(to).length;

  const out = [];
  for (let i = from; i < to; i++) {
    const marker = i === target ? '>' : ' ';
    out.push(`${marker} ${String(i + 1).padStart(gutter, ' ')} | ${lines[i]}`);
    // Caret goes immediately under the offending line, not at the end of the excerpt.
    if (i === target && loc.column > 0) {
      out.push(`${' '.repeat(gutter + 5)}${' '.repeat(loc.column - 1)}^`);
    }
  }
  return out.join('\n');
}

/** Best-effort operation name from the query text, for the group headline. */
function readOperationName(query) {
  if (typeof query !== 'string') return null;
  const named = query.match(/\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/);
  if (named) return named[1];
  const field = query.match(/{\s*([A-Za-z_]\w*)/);
  return field ? field[1] : null;
}

// ─── Console output ───────────────────────────────────────────────────────────

/** Fixed-width gutter so every line in the group aligns. Empty text = blank gutter. */
function label(text) {
  return text ? `${text}:`.padEnd(11, ' ') : ' '.repeat(11);
}

/**
 * Emit one console group describing the failure. Never throws.
 *
 * @param {object} detail
 * @param {number|null} detail.status      HTTP status, or null for a 200-with-errors
 * @param {string|null} detail.statusText
 * @param {string[]}    detail.messages    human-readable causes, most specific first
 * @param {string|null} detail.excType     e.g. "frappe.exceptions.ValidationError"
 * @param {string|null} detail.traceback
 * @param {object}      detail.ctx         { source, operation, endpoint, query, variables }
 * @param {Array}       detail.locations   GraphQL error locations
 * @param {*}           detail.body        parsed JSON body, if any
 * @param {string|null} detail.rawText     response text, for non-JSON bodies
 */
function logFailure({ status, statusText, messages, excType, traceback, ctx, locations, body, rawText }) {
  const { source, operation, endpoint, query, variables } = ctx;

  const parts = [
    status ? `GraphQL ${status}${statusText ? ` ${statusText}` : ''}` : 'GraphQL error',
    operation ?? readOperationName(query),
    source,
  ].filter(Boolean);

  try {
    console.group(`⛔ ${parts.join(' · ')}`);

    if (messages.length === 0) {
      console.log(`${label('Message')}(no message in response body — see Raw response)`);
    } else if (messages.length === 1) {
      console.log(`${label('Message')}${messages[0]}`);
    } else {
      messages.forEach((msg, i) => console.log(`${label(i === 0 ? 'Messages' : '')}${i + 1}. ${msg}`));
    }

    if (excType) console.log(`${label('Type')}${excType}`);
    if (endpoint) console.log(`${label('Endpoint')}${endpoint}`);

    // Logged as an object, not a string, so devtools renders it expandable.
    if (variables && typeof variables === 'object' && Object.keys(variables).length) {
      console.log(`${label('Variables')}`, variables);
    } else if (typeof variables === 'string' && variables.trim()) {
      console.log(`${label('Variables')}${variables}`);
    }

    const excerpt = queryExcerpt(query, locations);
    if (excerpt) {
      console.log(`${label('Query')}line ${locations[0].line}\n${excerpt}`);
    } else if (query) {
      console.groupCollapsed(`${label('Query')}(${String(query).split('\n').length} lines)`);
      console.log(query);
      console.groupEnd();
    }

    if (traceback) {
      console.groupCollapsed(`${label('Traceback')}(server)`);
      console.log(traceback);
      console.groupEnd();
    }

    console.groupCollapsed(`${label('Raw')}response body`);
    if (body) console.log(body);
    else console.log(rawText ? rawText.slice(0, MAX_RAW_CHARS) : '(empty body)');
    console.groupEnd();
  } catch {
    // Reporting must never mask the original failure.
  } finally {
    try { console.groupEnd(); } catch { /* no-op */ }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read a failed GraphQL Response, log it as a structured group, and return an
 * Error carrying the real message plus the parsed body. Clones the response, so
 * the caller can still read the original.
 *
 * @param {Response} response
 * @param {{source?: string, operation?: string, endpoint?: string, query?: string, variables?: object}} ctx
 * @returns {Promise<Error>} the error to throw — this helper never throws it for you
 */
export async function reportGraphQLFailure(response, ctx = {}) {
  let rawText = null;
  try {
    rawText = await response.clone().text();
  } catch {
    // Body already consumed or unreadable — fall back to the status line alone.
  }

  const body = rawText ? safeParse(rawText) : null;
  const messages = readMessages(body);
  const excType = readExcType(body);
  const endpoint = ctx.endpoint ?? response.url ?? undefined;

  logFailure({
    status: response.status,
    statusText: response.statusText,
    messages,
    excType,
    traceback: readTraceback(body),
    ctx: { ...ctx, endpoint },
    locations: readLocations(body),
    body,
    rawText,
  });

  const headline = messages[0] || (rawText ? rawText.slice(0, 200) : response.statusText) || 'Unknown error';
  const error = new Error(`GraphQL ${response.status}: ${headline}`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.graphQLErrors = body?.errors ?? [];
  error.responseBody = body ?? rawText;
  error.endpoint = endpoint;
  return error;
}

/**
 * Same reporting for a 200 response that carries `errors[]` in its body.
 *
 * @param {Array} errors  the `errors` array from the GraphQL response
 * @param {{source?: string, operation?: string, endpoint?: string, query?: string, variables?: object}} ctx
 * @returns {Error} the error to throw — this helper never throws it for you
 */
export function reportGraphQLErrors(errors, ctx = {}) {
  const body = { errors };
  const messages = readMessages(body);

  logFailure({
    status: null,
    statusText: null,
    messages,
    excType: readExcType(body),
    traceback: readTraceback(body),
    ctx,
    locations: readLocations(body),
    body,
    rawText: null,
  });

  const error = new Error(messages[0] || 'GraphQL request returned errors');
  error.graphQLErrors = errors ?? [];
  error.endpoint = ctx.endpoint;
  return error;
}
