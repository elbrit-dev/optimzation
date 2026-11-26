import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionCard } from '../components/QuestionCard';
import { answerProblem, formProblems, toPayload } from '../data/shape';
import { filledQuestions } from '../data/view';

/* 26 Nov 2026 · Survey Studio questions on the phone: "Show from ERP" (read-only fields of the record),
   a photo from the camera, and Redo (a file the AI found not Clear must be uploaded again). */

const erp = { id: 'e1', type: 'erp_info', label: 'About the doctor', required: 0, fields: [{ tag: '{#territory}', label: 'HQ' }, { tag: '{#mobile_no}', label: 'Mobile' }] };
const photo = { id: 'p1', type: 'file_upload', label: 'Photo of the board', required: 1, accept: 'image', max_mb: 5, max_files: 1, camera: 1,
  ai: { schema: { type: 'object', properties: { board: { type: 'boolean' } } }, tags: [{ label: 'Board visible', type: 'boolean' }], unclear: 'redo', check_phone: 1 } };

describe('Show from ERP', () => {
  it('fills each field from the record, shows it read-only and asks nothing', () => {
    const [q] = filledQuestions({ questions: [erp] }, { values: { territory: 'HQ-Salem', mobile_no: '' } });
    expect(q.fields.map((f) => f.value)).toEqual(['HQ-Salem', '—']);
    render(<QuestionCard q={q} index={0} value={undefined} onChange={() => {}} />);
    expect(screen.getByText('From ERP')).toBeTruthy();
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.getByText('HQ-Salem')).toBeTruthy();
    expect(screen.getByText('Not on record')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(answerProblem(q, undefined)).toBeNull();
    expect(toPayload([q], {})).toEqual({});
  });
});

describe('Photo and the AI', () => {
  it('a camera photo says "Take a photo" and what the AI reads', () => {
    render(<QuestionCard q={photo} index={0} value={[]} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByText('Take a photo')).toBeTruthy();
    expect(screen.getByText(/We read this automatically: Board visible\. You can correct the values before you submit\. It is checked on your phone first\./)).toBeTruthy();
  });

  it('Redo: a file that is not Clear blocks Submit until it is replaced; what was read is shown to check', () => {
    const bad = [{ url: '/private/files/a.jpg', name: 'a.jpg', size: 10, ai: { state: 'clerk', why: 'Not met: board', redo: 1, fields: { board: false } } }];
    expect(formProblems([photo], { p1: bad })).toEqual({ p1: 'A file is not clear — remove it and upload it again.' });
    render(<QuestionCard q={photo} index={0} value={bad} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Not clear — Not met: board\. Remove it and upload it again\./);
    expect(screen.getByText('We read · check and correct')).toBeTruthy();
    expect(screen.getByDisplayValue('No')).toBeTruthy();
    const ok = [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10, ai: { state: 'clear', why: '', redo: 0 } }];
    expect(formProblems([photo], { p1: ok })).toEqual({});
    expect(toPayload([photo], { p1: ok })).toEqual({ p1: [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10 }] });
  });
});

/* 27 Nov 2026 · "Also read every line of a table": the medicines the AI read show as a table, not as text to edit */
describe('Lines the AI read', () => {
  it('a prescription shows each medicine as a row; the single values stay editable', () => {
    const rx = [{ url: '/private/files/rx.jpg', name: 'rx.jpg', size: 10, ai: { state: 'clerk', why: 'Not met: readable', redo: 1,
      fields: { doctor_name: 'Dr A K Jaiswal', rows: [{ medicine: 'Cardio 10', dose: '1-0-1' }, { medicine: 'Derma Soft', dose: '0-0-1' }] } } }];
    render(<QuestionCard q={photo} index={0} value={rx} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByDisplayValue('Dr A K Jaiswal')).toBeTruthy();
    expect(screen.getByText('2 lines read')).toBeTruthy();
    expect(screen.getByText('Cardio 10')).toBeTruthy();
    expect(screen.getByText('0-0-1')).toBeTruthy();
    expect(screen.queryByDisplayValue(/Cardio 10/)).toBeNull();
  });
});

/* 27 Nov 2026 · the artifact's phone controls and the record card */
describe('Survey Studio controls', () => {
  it('Yes / No is two tiles; Rating 1 to 5 is five numbered circles', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const picked = [];
    render(<QuestionCard q={{ id: 'y', type: 'multiple_choice', studio_type: 'yesno', label: 'Display visible?', required: 1, options: ['Yes', 'No'] }} index={0} value="" onChange={(v) => picked.push(v)} />);
    expect(screen.getByText('Q1 · Yes')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(picked).toEqual(['Yes']);
    render(<QuestionCard q={{ id: 'r', type: 'rating', studio_type: 'rating', label: 'Service', max: 5 }} index={1} value={4} onChange={() => {}} />);
    expect(screen.getAllByRole('radio', { name: /of 5$/ })).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '4 of 5' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the record card shows the fields head office picked: code chip, city with a pin, the rest as lines', async () => {
    const { SubjectCard } = await import('../components/SubjectCard');
    render(<SubjectCard subject={{ label: 'Dr Asha', code: '11564' }} state="new" fields={[{ k: 'custom_doctor_code', l: 'Doctor Code', v: '11564' }, { k: 'city', l: 'City', v: 'Chennai' }, { k: 'custom_specialty', l: 'Specialty', v: 'CARDIO' }]} added />);
    expect(screen.getByText('11564')).toBeTruthy();
    expect(screen.getByText('Chennai')).toBeTruthy();
    expect(screen.getByText('Specialty')).toBeTruthy();
    expect(screen.getByText('CARDIO')).toBeTruthy();
    expect(screen.getByText('Added by you')).toBeTruthy();
  });
});
