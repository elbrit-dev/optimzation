import { describe, expect, it } from 'vitest';
import { fillText, filledQuestions, markdownHtml, messageHtml, safeHtml, viewHtml } from '../data/view';
import { surveysFromMyList, targetOf } from '../data/shape';
import { createSurveyApi } from '../api';

/* Survey Center's additions, as the ERP's My Surveys shows them: the View,
   {#field} placeholders, DocType / list nouns, announcements. */

const survey = { title: 'Q3 check', description: '', due_date: '2026-11-26', summary: '' };
const row = { values: { lead_name: 'Dr. Ravi <b>K</b>', city: '', territory: 'HQ-Madurai' } };

describe('the View', () => {
  it('keeps only safe HTML: no scripts, handlers, javascript: links or unsafe styles', () => {
    const out = safeHtml('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://e.org">ok</a>' +
      '<span style="color: red; background: url(x)">c</span><iframe src="https://e.org"></iframe><img src="http://e.org/a.png"><img src="https://e.org/b.png">');
    expect(out).not.toMatch(/script|onclick|javascript|iframe|url\(|http:\/\//);
    expect(out).toContain('<a href="https://e.org" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(out).toContain('<span style="color: red">c</span>');
    expect(out).toContain('<img src="https://e.org/b.png">');
    expect(safeHtml('<b>open')).toBe('<b>open</b>');
  });

  it('fills placeholders with this record’s values, escaped; an empty survey value is blank, an empty record value "Not on record"', () => {
    const html = viewHtml({ ...survey, summary: '<h2>{#lead_name}</h2><p>{#survey_title} - {#survey_description}. City: {#city}, {#territory}</p>' }, row);
    expect(html).toBe('<h2>Dr. Ravi &lt;b&gt;K&lt;/b&gt;</h2><p>Q3 check - . City: <span class="vw-na">Not on record</span>, HQ-Madurai</p>');
    expect(viewHtml(survey, row)).toBe('');
  });

  it('reads simple marks too', () => {
    expect(markdownHtml('**Hi** {#x}\n- a\n- b')).toBe('<p><b>Hi</b> {#x}</p><ul><li>a</li><li>b</li></ul>');
    expect(messageHtml('<p>x</p>')).toBe('<p>x</p>');
  });

  it('fills the questions: labels, descriptions and options', () => {
    const qs = filledQuestions({ ...survey, questions: [{ id: 'a', label: 'Is {#lead_name} in {#territory}?', options: ['{#city}', 'No'] }] }, row);
    expect(qs[0].label).toBe('Is Dr. Ravi <b>K</b> in HQ-Madurai?');
    expect(qs[0].options).toEqual(['—', 'No']);
    expect(fillText('no tags', survey, row)).toBe('no tags');
  });
});

describe('Survey Center’s survey kinds', () => {
  it('a DocType / list survey is named by its noun', () => {
    expect(targetOf('DocType', { noun: 'Supplier' })).toEqual({ one: 'supplier', many: 'suppliers', Many: 'Suppliers' });
    expect(targetOf('DocType', null).one).toBe('record');
    expect(targetOf('Doctor').Many).toBe('Doctors');
  });

  it('carries the View, what it is about and the announcement from survey_my_list', () => {
    const [s, a] = surveysFromMyList({
      surveys: [
        { response: 'R1', campaign: 'C1', title: 'T', state: 'todo', questions: [], target: 'DocType', about: { noun: 'chemist' }, summary: '<p>{#x}</p>', values: { x: '1' } },
        { response: 'R2', campaign: 'C2', title: 'A', state: 'todo', questions: [], target: 'Employees', kind: 'announcement', announcement: { message: 'Hi', ack: 1 } },
      ],
      selftag: [],
    });
    expect([s.kind, s.about.noun, s.summary, s.rows[0].values.x]).toEqual(['survey', 'chemist', '<p>{#x}</p>', '1']);
    expect([a.kind, a.announcement.ack]).toEqual(['announcement', 1]);
  });

  it('the mock marks an announcement read', async () => {
    const api = createSurveyApi({ source: 'mock', delay: 0 });
    const list = await api.getMyList();
    const r = list.surveys[0].response;
    const m = await api.markRead(r, 1);
    expect([m.status, m.acknowledged]).toEqual(['Submitted', 1]);
  });
});
