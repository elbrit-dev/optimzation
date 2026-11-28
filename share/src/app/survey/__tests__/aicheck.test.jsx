import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuestionCard } from '../components/QuestionCard';
import { aiCheck, aiFlags, answerProblem, toPayload } from '../data/shape';

/* 28 Nov 2026 · every AI-read upload: the rep corrects what was read (no reason needed); the AI check's flags need a
   reason before Submit; flags, reason and corrections go with the file as `check` */
const file = { id: 'q5', type: 'file_upload', label: 'Distributor statement', required: 1, accept: 'pdf_image', max_files: 1, ai: { schema: { type: 'object', properties: {} } } };
const read = () => ({
  distributor_name: 'FOCUS MEDISALES PVT. LTD.',
  statement_month: null,
  rows: [
    { product: 'BRITVIT TAB', sales_qty: '16', closing_qty: '15', rate: '76.19', elbrit_product: 'BRITVIT' },
    { product: 'CALBRIT XT TAB', sales_qty: '13', closing_qty: '27', rate: '171.43', elbrit_product: 'CALBRIT XT' },
    { product: 'Telma 40 Tab', sales_qty: '70', closing_qty: '60', rate: null, elbrit_product: null },
  ],
  elbrit_summary: { lines: 3, elbrit: 2, others: 1, found: true, items: ['BRITVIT', 'CALBRIT XT'] },
});
const upload = (extra = {}) => [{ url: '/private/files/s.pdf', name: 's.pdf', size: 9, ai: { state: 'clear', why: '', redo: 0, fields: read(), orig: read(), ...extra } }];

describe('AI check on an upload', () => {
  it('flags lines that are not Elbrit and a field not found; Submit waits for the reason', () => {
    const v = upload();
    expect(aiFlags(v[0])).toEqual(["1 line isn't Elbrit: Telma 40 Tab", 'Not found: statement month']);
    expect(answerProblem(file, v)).toBe('Write why for the flags on the file.');
    const ok = upload({ reason: 'Telma is another company; the month is on page 2 (Oct 2026).' });
    expect(answerProblem(file, ok)).toBeNull();
  });

  it('a correction needs no reason, and it is sent as old → new with the flags and the reason', () => {
    const v = upload({ reason: 'Telma is another company.' });
    v[0].ai.fields.statement_month = 'Oct 2026';
    v[0].ai.fields.rows[1].sales_qty = '15';
    expect(aiFlags(v[0])).toEqual(["1 line isn't Elbrit: Telma 40 Tab"]);
    expect(aiCheck(v[0])).toEqual({
      flags: ["1 line isn't Elbrit: Telma 40 Tab"],
      reason: 'Telma is another company.',
      edits: { fields: { statement_month: ['', 'Oct 2026'] }, rows: [[1, 'CALBRIT XT', 'sales_qty', '13', '15']] },
    });
    expect(toPayload([file], { q5: v }).q5[0]).toMatchObject({ url: '/private/files/s.pdf', check: { reason: 'Telma is another company.' } });
    const clean = [{ url: '/private/files/c.jpg', name: 'c.jpg', size: 1, ai: { state: 'clear', fields: { distributor_name: 'X' }, orig: { distributor_name: 'X' } } }];
    expect(aiFlags(clean[0])).toEqual([]);
    expect(toPayload([file], { q5: clean })).toEqual({ q5: [{ url: '/private/files/c.jpg', name: 'c.jpg', size: 1 }] });
  });

  it('on the phone: Elbrit lines can be edited, the flags are listed with a required "Why?"', () => {
    let got = null;
    render(<QuestionCard q={file} index={0} value={upload()} onChange={(v) => { got = v; }} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByText('Elbrit lines · 2 of 3')).toBeTruthy();
    expect(screen.queryByDisplayValue('Telma 40 Tab')).toBeNull();
    expect(screen.getByText(/1 line isn't Elbrit: Telma 40 Tab/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sales qty, line 2'), { target: { value: '15' } });
    expect(got[0].ai.fields.rows[1].sales_qty).toBe('15');
    fireEvent.change(screen.getByPlaceholderText(/Say why/), { target: { value: 'Telma is another company.' } });
    expect(got[0].ai.reason).toBe('Telma is another company.');
  });
});

/* 28 Nov 2026 · pharmacy mapping: the rep chooses the distributor that serves the pharmacy */
describe('Pharmacy: which distributor serves it', () => {
  const map = { id: 'q2', type: 'map_location', label: 'Pharmacy', required: 1, places: 'pharmacy', serving: 1 };
  const pharmacy = { lat: 26.779, lng: 82.1805, place_id: 'p1', name: 'Shree Ram Medical Store', address: 'Rikabganj, Ayodhya 224001', how: 'place' };

  it('is required once a pharmacy is chosen', () => {
    expect(answerProblem(map, pharmacy)).toBe('Choose which distributor serves the pharmacy.');
    expect(answerProblem(map, { ...pharmacy, serving: { customer: 'Buddha Medical Agencies', label: 'Buddha Medical Agencies', why: 'Same PIN' } })).toBeNull();
    expect(answerProblem(map, { ...pharmacy, serving: { none: 1 } })).toBeNull();
  });

  it('lists the distributors for the pharmacy PIN and keeps the choice in the answer', async () => {
    const asked = [];
    const api = {
      servingDistributors: async (q) => { asked.push(q); return { items: [{ customer: 'Buddha Medical Agencies', label: 'Buddha Medical Agencies', pin: '224001', hq: 'HQ-Ayodhya', why: 'Same PIN' }] }; },
      mapsKey: async () => ({}),
      places: async () => ({ places: [] }),
    };
    let got = null;
    render(<QuestionCard q={map} index={0} value={pharmacy} onChange={(v) => { got = v; }} api={api} response="SR-1" />);
    await waitFor(() => expect(screen.getByText('Buddha Medical Agencies')).toBeTruthy());
    expect(asked[0]).toEqual({ response: 'SR-1', pin: '224001' });
    fireEvent.click(screen.getByText('Buddha Medical Agencies'));
    expect(got.serving).toEqual({ customer: 'Buddha Medical Agencies', label: 'Buddha Medical Agencies', why: 'Same PIN' });
  });
});
