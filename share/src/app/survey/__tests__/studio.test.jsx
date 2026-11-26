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
    expect(screen.getByText(/We read this automatically: Board visible\. You can check what was read before you submit\./)).toBeTruthy();
  });

  it('Redo: a file that is not Clear blocks Submit until it is replaced; what was read is shown to check', () => {
    const bad = [{ url: '/private/files/a.jpg', name: 'a.jpg', size: 10, ai: { state: 'clerk', why: 'Not met: board', redo: 1, fields: { board: false } } }];
    expect(formProblems([photo], { p1: bad })).toEqual({ p1: 'A file is not clear — remove it and upload it again.' });
    render(<QuestionCard q={photo} index={0} value={bad} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Not clear — Not met: board\. Remove it and upload it again\./);
    expect(screen.getByText('We read')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    const ok = [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10, ai: { state: 'clear', why: '', redo: 0 } }];
    expect(formProblems([photo], { p1: ok })).toEqual({});
    expect(toPayload([photo], { p1: ok })).toEqual({ p1: [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10 }] });
  });
});
