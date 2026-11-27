/* The rep-side survey API against the real ERP — SURVEYS_CONTEXT.md §4,
 * as the SIGNED-IN PERSON (§5.1). Same functions and shapes as mockApi.js:
 *
 *   getMyList()                    GET  survey_my_list
 *   getMySubjects(campaign, q)     GET  survey_my_subjects (campaign, q, start, limit)
 *   startSubject(campaign, name)   POST survey_start_subject
 *   uploadFile(file, onProgress)   POST upload_file — multipart, is_private=1, with progress
 *   submitResponse(response, a)    POST survey_submit_response — answers as a JSON string
 *
 * HOW IT CALLS, as the rest of the app does (Ring Nav's useErpTiles,
 * Secondary's writer):
 *   host    the /tokens row `gqlEnvironment` names, resolved by
 *           getEndpointConfigFromUrlKeyAsync — or `endpointUrl` given
 *           directly (the dev harness's local UAT)
 *   who     Authorization: token <key:secret> — the person's OWN token
 *           (`gqlToken`). Never a shared key: every script answers for
 *           frappe.session.user. No token, no call.
 *   errors  the ERP's own sentence (Secondary's erpErrorMessage digs it out
 *           of _server_messages) — they are written for people. A CSRF
 *           refusal is explained (§5.2): with token auth it should not
 *           happen; when it does the request went out as a browser session.
 *
 * `allowWrites: false` refuses start / upload / submit before anything is
 * sent — the dev harness sets it on production hosts. */

import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { authHeader } from '@/app/ring-nav/data/useErpTiles';
import { erpErrorMessage } from '@/app/secondary-entry/data/writes';

export const CSRF_MESSAGE =
  'The ERP refused this as a browser-session request without its security token (CSRFTokenError). The app should send your own ERP token — sign in again; if it keeps happening, tell IT the app is calling the ERP with cookies instead of a token.';
const OFFLINE_MESSAGE =
  'Could not reach the ERP. Check your connection; if you are online, the ERP may not be allowing this app (CORS — see SURVEYS_CONTEXT.md §5.3).';
const PROD_BLOCKED = 'Sending to the production ERP is switched off here — test on UAT.';

/* The person-facing sentence for a refused or failed call. */
export function surveyErrorMessage(json, status) {
  const exc = `${json?.exc_type ?? ''} ${json?.exception ?? ''}`;
  if (/CSRFTokenError/.test(exc) || (status === 400 && /Invalid Request/i.test(JSON.stringify(json ?? {})))) return CSRF_MESSAGE;
  if ((status === 401 || status === 403) && !json?._server_messages) return 'The ERP did not accept your login. Sign in again.';
  return erpErrorMessage(json, status);
}

/* `strictEnvironment`: the /tokens registry answers an unknown name with
   its DEFAULT row — a typo would quietly read and write another ERP. With
   it on, the row found must carry exactly the name asked for, or nothing
   is sent. */
export function createErpApi({ endpointUrl, gqlEnvironment = 'ERP', gqlToken, allowWrites = true, strictEnvironment = false, fetchImpl, XHR } = {}) {
  const auth = authHeader(gqlToken);
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));
  let originPromise = null;
  const origin = () => {
    originPromise ??= (async () => {
      let url = endpointUrl;
      if (!url) {
        const config = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
        if (strictEnvironment && config?.name !== gqlEnvironment) {
          throw new Error(`No ERP named "${gqlEnvironment}" in /tokens. Set gqlEnvironment to a row name exactly as it is there (e.g. UAT or ERP).`);
        }
        url = config?.endpointUrl;
      }
      if (!url) throw new Error(`No ERP is set up for "${gqlEnvironment}".`);
      return new URL(url).origin;
    })();
    originPromise.catch(() => {
      originPromise = null;
    });
    return originPromise;
  };
  const needAuth = () => {
    if (!auth) throw new Error('Sign in to see your surveys.');
  };
  const needWrites = () => {
    if (!allowWrites) throw new Error(PROD_BLOCKED);
  };

  async function call(method, name, { query, body } = {}) {
    needAuth();
    const base = await origin();
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))}` : '';
    let res;
    try {
      res = await doFetch(`${base}/api/method/${name}${qs}`, {
        method,
        headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.exc_type || json?.exception) throw new Error(surveyErrorMessage(json, res.status));
    return json?.message;
  }

  return {
    source: 'erp',

    getMyList: () => call('GET', 'survey_my_list'),

    /* 27 Nov 2026 · Survey Studio: lat / lng = "near me" (5 km), q = search the whole ERP */
    getMySubjects: (campaign, q = '', { start = 0, limit = 200, lat, lng } = {}) =>
      call('GET', 'survey_my_subjects', { query: { campaign, q: q.trim(), start, limit, ...(lat != null && lng != null ? { lat, lng } : {}) } }),

    async startSubject(campaign, subject) {
      needWrites();
      return call('POST', 'survey_start_subject', { body: { campaign, subject } });
    },

    /* XMLHttpRequest, not fetch: only XHR reports upload progress. Private,
       as the person (§4) — survey_submit_response refuses anyone else's. */
    async uploadFile(file, onProgress) {
      needAuth();
      needWrites();
      const base = await origin();
      const Req = XHR ?? XMLHttpRequest;
      return new Promise((resolve, reject) => {
        const xhr = new Req();
        xhr.open('POST', `${base}/api/method/upload_file`);
        xhr.setRequestHeader('Authorization', auth);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(e.loaded / e.total);
        };
        xhr.onerror = () => reject(new Error(OFFLINE_MESSAGE));
        xhr.onload = () => {
          let json = null;
          try {
            json = JSON.parse(xhr.responseText);
          } catch {
            /* a proxy error page; the status says enough */
          }
          if (xhr.status < 200 || xhr.status >= 300 || json?.exc_type || json?.exception || !json?.message?.file_url) {
            reject(new Error(surveyErrorMessage(json, xhr.status)));
            return;
          }
          onProgress?.(1);
          const m = json.message;
          resolve({ file_url: m.file_url, file_name: m.file_name, file_size: m.file_size ?? file.size });
        };
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('is_private', '1');
        xhr.send(form);
      });
    },

    /* 23 Nov 2026: a File upload question with an AI schema — right after the
       upload, our server reads the file (Gemma 4) and keeps what it read on the
       response for Survey Center (pages/api/survey/read-file.js). A PDF goes as
       its text, or its page pictures, copied out here. The rep only ever hears
       back whether the file could be read: { readable, reason } — never the
       fields, never a decision. Any failure here is not the rep's: { skipped }. */
    /* 24 Nov 2026 · Map location question: the ERP's Google Maps browser key
       (as /doctor-connect uses), and the Google place search the ERP runs with
       its server key → { places: [{ id, title, address, lat, lng, url }] }. */
    mapsKey: () => call('GET', 'survey_maps_key'),
    searchPlaces: ({ q, lat, lng }) => call('GET', 'doctor_connect_places', { query: { q, lat, lng, radius_km: lat != null ? 40 : undefined } }),
    /* 25 Nov 2026 · Google hospitals / clinics only (survey_places, the ERP's server key):
       mode=nearby (lat, lng, radius_m, split) | text (q, lat?, lng?) | details (id)
       → { places: [{ id, title, address, lat, lng, url, kind }] } */
    places: (query) => call('GET', 'survey_places', { query }),
    /* 25 Nov 2026 · the Login question's Verify: does the website open? → { ok, url, message } */
    checkUrl: (url) => call('GET', 'survey_check_url', { query: { url } }),
    /* 26 Nov 2026 · the Login question's Test login: the app's server signs in to the website (pages/api/survey/test-login)
       → { result: 'verified' | 'not_verified', code, message } */
    async testLogin({ response, question, url, login, password }) {
      needAuth();
      const base = await origin();
      const res = await doFetch('/api/survey/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-erp-token': auth, 'x-erp-endpoint': base },
        body: JSON.stringify({ response, question, url, login, password }),
        signal: AbortSignal.timeout(90000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { result: 'not_verified', code: 'error', message: json.error || `The test could not run (HTTP ${res.status}).` };
      return json;
    },
    /* 26 Nov 2026 · Survey Studio approvals (survey_approval):
       { action: 'list', which: 'pending' | 'done' } → { items, all }
       { action: 'decide', response, decision: 'approve' | 'return', note } · { action: 'approve_all', responses: JSON list } */
    approval(args) {
      if (args?.action === 'decide' || args?.action === 'approve_all') {
        needWrites();
        return call('POST', 'survey_approval', { body: args });
      }
      return call('GET', 'survey_approval', { query: args });
    },

    async readFile({ response, question, file_url, file }) {
      try {
        needAuth();
        const base = await origin();
        const form = new FormData();
        form.append('response', response);
        form.append('question', question);
        form.append('file_url', file_url);
        if (file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''))) {
          const { pdfForReading } = await import('@calendar/lib/field-expenses/bill-reader');
          const pdf = await pdfForReading(file, { maxPages: 30 });
          if (pdf.text) form.append('text', pdf.text);
          for (const p of pdf.pages || []) form.append('page', p, p.name);
        }
        const res = await doFetch('/api/survey/read-file', {
          method: 'POST',
          headers: { 'x-erp-token': auth, 'x-erp-endpoint': base },
          body: form,
          signal: AbortSignal.timeout(300000),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { skipped: json.error || `HTTP ${res.status}` };
        return json;
      } catch (e) {
        return { skipped: e?.message || 'failed' };
      }
    },

    async submitResponse(response, answers) {
      needWrites();
      return call('POST', 'survey_submit_response', { body: { response, answers: JSON.stringify(answers ?? {}) } });
    },

    /* An announcement read (ack 1 = "I have read and understood" ticked). */
    async markRead(response, ack = 0) {
      needWrites();
      return call('POST', 'survey_mark_read', { body: { response, ack: ack ? 1 : 0 } });
    },

    /* An announcement's attachment: a PRIVATE file that survey_my_list names
       as an ERP path (/api/method/survey_announcement_file?response=…). It is
       fetched as the person — a bare link would arrive without the token —
       and opened from memory in a new tab. */
    async openFile(url, name) {
      needAuth();
      const base = await origin();
      const href = new URL(String(url || ''), `${base}/`);
      if (href.origin !== base) throw new Error('This attachment is not on the ERP.');
      const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
      let res;
      try {
        res = await doFetch(href.toString(), { headers: { Authorization: auth } });
      } catch {
        win?.close();
        throw new Error(OFFLINE_MESSAGE);
      }
      if (!res.ok) {
        win?.close();
        const json = await res.json().catch(() => null);
        throw new Error(surveyErrorMessage(json, res.status));
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      if (win) win.location.href = blobUrl;
      else if (typeof window !== 'undefined') window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return { name: name || 'Attachment' };
    },
  };
}
