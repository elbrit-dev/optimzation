import { describe, expect, it, vi } from 'vitest';
import { createSurveyApi } from '../api';
import { CSRF_MESSAGE } from '../data/erpApi';

const ERP = 'https://erp-uat.example.org/api/method/graphql';

function fakeFetch(answer = () => ({ message: { ok: true } }), status = 200) {
  return vi.fn(async () => ({ ok: status < 400, status, json: async () => answer() }));
}
const api = (fetchImpl, extra = {}) => createSurveyApi({ source: 'erp', endpointUrl: ERP, gqlToken: 'k:s', fetchImpl, ...extra });

describe('the ERP survey source (SURVEYS_CONTEXT.md §4, §5)', () => {
  it('asks survey_my_list as the person, with their own token', async () => {
    const f = fakeFetch(() => ({ message: { surveys: [], selftag: [] } }));
    expect(await api(f).getMyList()).toEqual({ surveys: [], selftag: [] });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://erp-uat.example.org/api/method/survey_my_list');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('token k:s');
  });

  it('searches subjects with campaign, q, start and limit', async () => {
    const f = fakeFetch(() => ({ message: { rows: [] } }));
    await api(f).getMySubjects('SC-1', ' murugan ');
    expect(f.mock.calls[0][0]).toBe('https://erp-uat.example.org/api/method/survey_my_subjects?campaign=SC-1&q=murugan&start=0&limit=200');
  });

  it('posts start and submit as JSON — answers as a JSON string', async () => {
    const f = fakeFetch();
    await api(f).startSubject('SC-1', 'CUST-1');
    await api(f).submitResponse('SR-1', { q1: [{ url: '/private/files/a.pdf', name: 'a.pdf', size: 3 }] });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ campaign: 'SC-1', subject: 'CUST-1' });
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body.response).toBe('SR-1');
    expect(JSON.parse(body.answers)).toEqual({ q1: [{ url: '/private/files/a.pdf', name: 'a.pdf', size: 3 }] });
  });

  it('shows the ERP’s own sentence when it refuses', async () => {
    const f = fakeFetch(() => ({ exc_type: 'ValidationError', _server_messages: JSON.stringify([JSON.stringify({ message: 'This survey is closed.' })]) }), 417);
    await expect(api(f).submitResponse('SR-1', {})).rejects.toThrow('This survey is closed.');
  });

  it('explains a CSRF refusal instead of failing silently', async () => {
    const f = fakeFetch(() => ({ exc_type: 'CSRFTokenError', exception: 'frappe.exceptions.CSRFTokenError' }), 400);
    await expect(api(f).getMyList()).rejects.toThrow(CSRF_MESSAGE);
    const g = fakeFetch(() => ({ message: 'Invalid Request' }), 400);
    await expect(api(g).getMyList()).rejects.toThrow(CSRF_MESSAGE);
  });

  it('makes no call without the person’s token, and says why', async () => {
    const f = fakeFetch();
    await expect(createSurveyApi({ source: 'erp', endpointUrl: ERP, fetchImpl: f }).getMyList()).rejects.toThrow('Sign in to see your surveys.');
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses writes when writes are off (production in the harness), reads still work', async () => {
    const f = fakeFetch(() => ({ message: { surveys: [] } }));
    const prod = api(f, { allowWrites: false });
    await expect(prod.startSubject('SC-1', 'C')).rejects.toThrow(/production/);
    await expect(prod.submitResponse('SR-1', {})).rejects.toThrow(/production/);
    await expect(prod.uploadFile({ name: 'a.pdf', size: 1 })).rejects.toThrow(/production/);
    expect(f).not.toHaveBeenCalled();
    await prod.getMyList();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uploads privately, as the person, reporting progress', async () => {
    const sent = {};
    class FakeXHR {
      constructor() {
        this.upload = {};
        this.headers = {};
      }
      open(method, url) {
        Object.assign(sent, { method, url });
      }
      setRequestHeader(k, v) {
        this.headers[k] = v;
      }
      send(form) {
        sent.headers = this.headers;
        sent.isPrivate = form.get('is_private');
        sent.file = form.get('file')?.name;
        this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
        this.status = 200;
        this.responseText = JSON.stringify({ message: { file_url: '/private/files/a.pdf', file_name: 'a.pdf', file_size: 100 } });
        this.onload();
      }
    }
    const progress = [];
    const file = new File(['x'.repeat(100)], 'a.pdf', { type: 'application/pdf' });
    const res = await api(fakeFetch(), { XHR: FakeXHR }).uploadFile(file, (p) => progress.push(p));
    expect(res).toEqual({ file_url: '/private/files/a.pdf', file_name: 'a.pdf', file_size: 100 });
    expect(sent).toMatchObject({ method: 'POST', url: 'https://erp-uat.example.org/api/method/upload_file', isPrivate: '1', file: 'a.pdf' });
    expect(sent.headers.Authorization).toBe('token k:s');
    expect(progress).toEqual([0.5, 1]);
  });
});
