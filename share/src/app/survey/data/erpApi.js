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

    getMySubjects: (campaign, q = '', { start = 0, limit = 200 } = {}) =>
      call('GET', 'survey_my_subjects', { query: { campaign, q: q.trim(), start, limit } }),

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

    async submitResponse(response, answers) {
      needWrites();
      return call('POST', 'survey_submit_response', { body: { response, answers: JSON.stringify(answers ?? {}) } });
    },
  };
}
