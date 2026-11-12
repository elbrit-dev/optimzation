import { describe, expect, it } from 'vitest';
import { answerProblem, fileProblem, formProblems, rowState, shortName, surveysFromMyList, toPayload } from '../data/shape';
import { surveyTiles, withSurveyTiles } from '../data/tiles';
import { DEFAULT_RING_NAV_ITEMS } from '@/app/ring-nav/data/defaultRingNavItems';
import { createSurveyApi } from '../api';
import { CAMPAIGNS, DISTRIBUTORS } from '../data/mockData';

const q = (type, extra = {}) => ({ id: 'q', type, label: 'Q', required: 1, ...extra });
const SECONDARY = CAMPAIGNS.find((c) => c.key === 'secondary');

describe('answers (SURVEYS_CONTEXT.md §3)', () => {
  it('asks for a required answer in each type’s words', () => {
    expect(answerProblem(q('short_text'), '  ')).toBe('Please answer this question to continue.');
    expect(answerProblem(q('checkboxes'), [])).toBe('Please choose at least one option to continue.');
    expect(answerProblem(q('file_upload'), [])).toBe('Please upload a file to continue.');
    expect(answerProblem({ ...q('short_text'), required: 0 }, '')).toBeNull();
  });

  it('checks numbers, dates, options and ranges', () => {
    expect(answerProblem(q('number'), '12a')).toMatch(/number/);
    expect(answerProblem(q('number'), '4.5')).toBeNull();
    expect(answerProblem(q('date'), '11/11/2026')).toMatch(/date/);
    expect(answerProblem(q('dropdown', { options: ['A'] }), 'B')).toMatch(/options/);
    expect(answerProblem(q('linear_scale', { min: 0, max: 10 }), 0)).toBeNull();
    expect(answerProblem(q('rating', { max: 5 }), 6)).toMatch(/1 to 5/);
  });

  it('checks a file against the question before uploading', () => {
    const st = SECONDARY.questions[0];
    expect(fileProblem(st, { name: 'oct.pdf', size: 1e6 })).toBeNull();
    expect(fileProblem(st, { name: 'oct.xlsx', size: 1e3 })).toMatch(/not a PDF or image/);
    expect(fileProblem(st, { name: 'big.jpg', size: 6 * 1024 * 1024 })).toMatch(/larger than 5 MB/);
    expect(fileProblem({ ...st, accept: 'any' }, { name: 'x.exe', size: 1 })).toMatch(/not a/);
  });

  it('sends what survey_submit_response takes', () => {
    const qs = [q('number'), { ...q('file_upload'), id: 'f' }, { ...q('short_text'), id: 's', required: 0 }];
    expect(toPayload(qs, { q: '12', f: [{ url: '/private/files/a.pdf', name: 'a.pdf', size: 9, progress: 1 }], s: '' })).toEqual({
      q: 12,
      f: [{ url: '/private/files/a.pdf', name: 'a.pdf', size: 9 }],
    });
    expect(Object.keys(formProblems(qs, {}))).toEqual(['q', 'f']);
  });
});

describe('surveys and circles', () => {
  it('names a circle by the title’s first words', () => {
    expect(shortName('Rx audit — vascular range')).toBe('Rx audit');
    expect(shortName('Secondary statement — October')).toBe('Secondary');
    expect(shortName('Pharmacovigilance')).toBe('Pharmacovi…');
  });

  it('groups survey_my_list per campaign, with Self-tag ones before anything is added', async () => {
    const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0 });
    const surveys = surveysFromMyList(await api.getMyList());
    const by = Object.fromEntries(surveys.map((s) => [CAMPAIGNS.find((c) => c.name === s.campaign).key, s]));
    expect(Object.keys(by).sort()).toEqual(['cme-invite', 'footfall', 'rx-audit', 'secondary']);
    expect(by['rx-audit']).toMatchObject({ state: 'todo', total: 4, done: 1, left: 3, selfTag: false });
    expect(by.secondary).toMatchObject({ state: 'todo', total: 0, selfTag: true, open: true });
    expect(by.footfall.state).toBe('done');
    expect(by['cme-invite'].state).toBe('missed');
  });

  it('gives nobody a circle for a survey they were not sent', async () => {
    const api = createSurveyApi({ source: 'mock', role: 'BE', scenario: 'empty', delay: 0 });
    expect(surveyTiles(await api.getMyList(), '2026-11-11')).toEqual([]);
    expect(withSurveyTiles(DEFAULT_RING_NAV_ITEMS, []).map((t) => t.id)).not.toContain('survey');
  });

  it('draws one circle per survey, due today first, done and missed last', async () => {
    const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0 });
    const tiles = surveyTiles(await api.getMyList(), '2026-11-11');
    expect(tiles.map((t) => t.label)).toEqual(['Secondary', 'Rx audit', 'Clinic', 'Diwali CME']);
    const [secondary, rx, footfall, cme] = tiles;
    expect(secondary).toMatchObject({
      href: '/survey/SC-2026-0034',
      count: 1,
      caption: 'Today',
      captionTone: 'danger',
      countTone: 'danger',
      ariaLabel: 'Secondary statement — October, nothing added yet, due today',
    });
    expect(rx).toMatchObject({ count: 3, caption: '18 Nov', captionTone: 'neutral', countTone: 'brand', ariaLabel: 'Rx audit — vascular range, 3 left of 4, due 18 Nov' });
    expect(rx.segments.map((x) => [x.key, x.tone, x.value])).toEqual([
      ['sent', 'success', 1],
      ['left', 'brand', 3],
    ]);
    expect(footfall).toMatchObject({ iconTone: 'neutral', ariaLabel: 'Clinic footfall check, all sent', segments: [{ tone: 'neutral' }] });
    expect(footfall.caption).toBeUndefined();
    expect(cme).toMatchObject({ caption: 'Missed', iconTone: 'neutral', segments: [{ tone: 'neutral' }] });
  });

  it('captions an overdue survey Late, in red, ahead of later ones', () => {
    const row = (c, due) => ({ response: `R-${c}`, campaign: c, state: 'todo', title: `Survey ${c}`, due_date: due, questions: [] });
    const list = { surveys: [row('A', '2026-11-25'), row('B', '2026-11-18')], selftag: [] };
    expect(surveyTiles(list, '2026-11-11').map((t) => [t.id, t.caption])).toEqual([
      ['survey-B', '18 Nov'],
      ['survey-A', '25 Nov'],
    ]);
    const late = surveyTiles(list, '2026-11-19');
    expect(late[0]).toMatchObject({ id: 'survey-B', caption: 'Late', captionTone: 'danger', ariaLabel: 'Survey B, 1 left of 1, overdue' });
  });

  it('places the circles right after the entry tiles, before the approvals', () => {
    const ids = withSurveyTiles(DEFAULT_RING_NAV_ITEMS, [{ id: 'survey-A' }, { id: 'survey-B' }]).map((t) => t.id);
    expect(ids.slice(0, 6)).toEqual(['secondary-entry', 'support-entry', 'expense-entry', 'survey-A', 'survey-B', 'secondary-approval']);
    expect(ids).not.toContain('survey');
  });

  it('shows a todo with a draft on this device as Draft', () => {
    expect(rowState({ state: 'todo', response: 'R1' }, { R1: { q: 1 } })).toBe('draft');
    expect(rowState({ state: 'todo', response: 'R2' }, { R1: {} })).toBe('new');
  });
});

describe('the mock ERP (SURVEYS_CONTEXT.md §4)', () => {
  it('runs the whiteboard flow: add D1–D4, upload, submit D1', async () => {
    const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0 });
    const D = DISTRIBUTORS.slice(0, 4);
    for (const d of D) await api.startSubject(SECONDARY.name, d.name);
    expect((await api.startSubject(SECONDARY.name, D[0].name)).existing).toBe(1);

    const subjects = await api.getMySubjects(SECONDARY.name, 'kanyakumari');
    expect(subjects.rows).toHaveLength(1);
    expect(subjects.rows[0].state).toBe('started');

    let s = surveysFromMyList(await api.getMyList()).find((x) => x.campaign === SECONDARY.name);
    expect(s).toMatchObject({ total: 4, done: 0, left: 4 });

    const progress = [];
    const file = await api.uploadFile({ name: 'oct statement.pdf', size: 200000 }, (p) => progress.push(p));
    expect(progress.at(-1)).toBe(1);
    expect(file.file_url).toBe('/private/files/oct-statement.pdf');

    const d1 = s.rows.find((r) => r.subject.name === D[0].name);
    await expect(api.submitResponse(d1.response, {})).rejects.toThrow('Please answer: Upload secondary statement');
    await api.submitResponse(d1.response, { q_st1: [{ url: file.file_url, name: file.file_name, size: file.file_size }] });

    s = surveysFromMyList(await api.getMyList()).find((x) => x.campaign === SECONDARY.name);
    expect(s).toMatchObject({ total: 4, done: 1, left: 3 });
    await expect(api.startSubject(SECONDARY.name, D[0].name)).rejects.toThrow(/already sent/);
  });

  it('refuses Pre-tag starts and closed surveys like the server', async () => {
    const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0 });
    const rx = CAMPAIGNS.find((c) => c.key === 'rx-audit');
    await expect(api.startSubject(rx.name, 'LEAD-04410')).rejects.toThrow(/Head Office chose/);
    const list = await api.getMyList();
    const missed = list.surveys.find((r) => r.state === 'missed');
    await expect(api.submitResponse(missed.response, {})).rejects.toThrow(/already Expired|closed/);
  });

  it('fails every call in the error scenario', async () => {
    await expect(createSurveyApi({ source: 'mock', scenario: 'error', delay: 0 }).getMyList()).rejects.toThrow(/reach the ERP/);
  });

  it('gives each role their own surveys', async () => {
    const titles = async (role) => surveysFromMyList(await createSurveyApi({ source: 'mock', role, delay: 0 }).getMyList()).map((s) => s.title).sort();
    expect(await titles('RBM')).toEqual(['Diwali CME invitation', 'Field app feedback']);
    expect(await titles('ABM')).toContain('Field app feedback');
  });
});
