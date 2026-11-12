/* THE ONE DOOR TO SURVEY DATA. Every screen gets its data from an object
 * made here — never from fetch, never from mock data directly:
 *
 *   const api = createSurveyApi({ source: 'erp', gqlEnvironment: 'ERP', gqlToken });
 *   api.getMyList()                      → survey_my_list        (SURVEYS_CONTEXT.md §4)
 *   api.getMySubjects(campaign, q)       → survey_my_subjects
 *   api.startSubject(campaign, subject)  → survey_start_subject
 *   api.uploadFile(file, onProgress)     → upload_file, private
 *   api.submitResponse(response, answers)→ survey_submit_response
 *
 * `source` is the single switch:
 *   'erp'   the real ERP, as the signed-in person (data/erpApi.js — how it
 *           calls, auth and errors are described there; §5)
 *   'mock'  the ERP played in memory (data/mockApi.js) — the harness's Mock
 * Both answer in the ERP's own shapes, so switching changes no screen. */

import { createMockApi } from './data/mockApi';
import { createErpApi } from './data/erpApi';

export const SOURCES = ['erp', 'mock'];

export function createSurveyApi({ source = 'erp', ...options } = {}) {
  if (source === 'mock') return createMockApi(options);
  if (source === 'erp') return createErpApi(options);
  throw new Error(`Unknown survey source "${source}".`);
}
