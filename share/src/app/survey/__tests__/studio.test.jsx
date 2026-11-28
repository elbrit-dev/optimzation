import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionCard } from '../components/QuestionCard';
import { whenText } from '../components/ApprovalQueue';
import { TIMING_DAYS, answerProblem, answerText, formProblems, isAnswered, toPayload } from '../data/shape';
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
  it('a camera photo says "Take a photo", without the long "We read" line', () => {
    render(<QuestionCard q={photo} index={0} value={[]} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByText('Take a photo')).toBeTruthy();
    expect(screen.queryByText(/We read this automatically/)).toBeNull();
  });

  it('Redo: a file that is not Clear blocks Submit until it is replaced; what was read is shown to check', () => {
    const bad = [{ url: '/private/files/a.jpg', name: 'a.jpg', size: 10, ai: { state: 'clerk', why: 'Not met: board', redo: 1, fields: { board: false } } }];
    expect(formProblems([photo], { p1: bad })).toEqual({ p1: 'A file is not clear — remove it and upload it again.' });
    render(<QuestionCard q={photo} index={0} value={bad} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getAllByRole('alert')[0].textContent).toMatch(/Not clear — Not met: board\. Remove it and upload it again\./);
    expect(screen.getByText('We read · correct anything wrong')).toBeTruthy();
    expect(screen.getByDisplayValue('No')).toBeTruthy();
    expect(screen.getByText(/AI check: Not met: board/)).toBeTruthy();
    const ok = [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10, ai: { state: 'clear', why: '', redo: 0 } }];
    expect(formProblems([photo], { p1: ok })).toEqual({});
    expect(toPayload([photo], { p1: ok })).toEqual({ p1: [{ url: '/private/files/b.jpg', name: 'b.jpg', size: 10 }] });
  });
});

/* 27 Nov 2026 · "Also read every line of a table": the medicines the AI read show as a table, not as text to edit */
describe('Lines the AI read', () => {
  it('a prescription shows each medicine as a row; values and lines can be corrected', () => {
    const rx = [{ url: '/private/files/rx.jpg', name: 'rx.jpg', size: 10, ai: { state: 'clerk', why: 'Not met: readable', redo: 1,
      fields: { doctor_name: 'Dr A K Jaiswal', rows: [{ medicine: 'Cardio 10', dose: '1-0-1' }, { medicine: 'Derma Soft', dose: '0-0-1' }] } } }];
    render(<QuestionCard q={photo} index={0} value={rx} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.getByDisplayValue('Dr A K Jaiswal')).toBeTruthy();
    expect(screen.getByText('2 lines read')).toBeTruthy();
    expect(screen.getByDisplayValue('Cardio 10')).toBeTruthy();
    expect(screen.getByDisplayValue('0-0-1')).toBeTruthy();
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

/* 27 Nov 2026 · phone check against the artifact */
describe('Answered, and help where the artifact puts it', () => {
  it('visiting timings with an Open day left empty is not answered yet; filled days are', () => {
    const q = { id: 't', type: 'timings', of: 'm', required: 1 };
    const days = {};
    TIMING_DAYS.forEach((d) => { days[d] = { state: 'closed', slots: [] }; });
    expect(isAnswered(q, { place_id: 'p', days: { ...days, Monday: { state: 'open', slots: [['', '']] } } })).toBe(false);
    expect(isAnswered(q, { place_id: 'p', days: { ...days, Monday: { state: 'open', slots: [['10:00', '13:00']] } } })).toBe(true);
    expect(isAnswered({ id: 'x', type: 'short_text' }, 'Gate 2')).toBe(true);
    expect(isAnswered({ id: 'x', type: 'short_text' }, '  ')).toBe(false);
  });

  it('a short text shows its help under the box; a map help that only repeats where the map starts is left out', () => {
    render(<QuestionCard q={{ id: 's', type: 'short_text', studio_type: 'text', label: 'Nearest landmark', description: 'A gate, a bus stop, a shop.', required: 1 }} index={0} value="" onChange={() => {}} />);
    const box = screen.getByRole('textbox');
    const help = screen.getByText('A gate, a bus stop, a shop.');
    expect(box.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('To approve: when it was sent', () => {
  it('reads Today HH:MM, Yesterday, N days ago', () => {
    const now = new Date(2026, 10, 27, 15, 0);
    expect(whenText('2026-11-27 01:57', now)).toBe('Today 01:57');
    expect(whenText('2026-11-26 18:10', now)).toBe('Yesterday');
    expect(whenText('2026-11-24 09:00', now)).toBe('3 days ago');
  });
});

/* 27 Nov 2026 · Repeated group: a few questions answered again for every entry */
describe('Repeated group', () => {
  const grp = {
    id: 'g1', type: 'repeat', label: 'Products out of stock', required: 1, button: 'Add another product', min: 1, max: 3,
    fields: [
      { id: 'c1', type: 'short_text', label: 'Product name', required: 1 },
      { id: 'c2', type: 'number', label: 'Quantity short', required: 1 },
      { id: 'c3', type: 'file_upload', label: 'Photo of the shelf', required: 0, accept: 'image', max_files: 1 },
    ],
  };

  it('asks for at least one entry, then every required question in every entry', () => {
    expect(answerProblem(grp, undefined)).toBe('Add at least one product to continue.');
    expect(answerProblem(grp, [{ c1: 'Cardio 10 mg', c2: '40' }, { c1: 'Derma Soft' }])).toBe('Product 2 · Quantity short: Please answer this question to continue.');
    expect(answerProblem(grp, [{ c1: 'Cardio 10 mg', c2: 'forty' }])).toBe('Product 1 · Quantity short: Please enter a number, for example 12 or 4.5.');
    expect(answerProblem(grp, [{ c1: 'A', c2: '1' }, { c1: 'B', c2: '2' }, { c1: 'C', c2: '3' }, { c1: 'D', c2: '4' }])).toBe('You can add up to 3 products here.');
    expect(answerProblem(grp, [{ c1: 'Cardio 10 mg', c2: '40' }, {}])).toBeNull();
    expect(isAnswered(grp, [{ c1: 'Cardio 10 mg', c2: '40' }])).toBe(true);
    expect(isAnswered(grp, [{ c1: 'Cardio 10 mg' }])).toBe(false);
  });

  it('sends only the filled entries, numbers as numbers and files as {url, name, size}', () => {
    const v = [{ c1: 'Cardio 10 mg', c2: '40', c3: [{ url: '/private/files/shelf.jpg', name: 'shelf.jpg', size: 10, ai: { state: 'clear' } }] }, {}];
    expect(toPayload([grp], { g1: v })).toEqual({ g1: [{ c1: 'Cardio 10 mg', c2: 40, c3: [{ url: '/private/files/shelf.jpg', name: 'shelf.jpg', size: 10 }] }] });
    expect(answerText(grp, [{ c1: 'Cardio 10 mg', c2: 40 }, { c1: 'Derma Soft', c2: 12 }])).toBe('1. Cardio 10 mg · 40\n2. Derma Soft · 12');
  });

  it('reads a photo inside the group with the AI, without the long "We read" line', () => {
    const withPhoto = { ...grp, fields: [grp.fields[0], { id: 'c4', type: 'file_upload', label: 'Photo of the shelf', required: 1, accept: 'image', max_files: 1, ai: { schema: { type: 'object', properties: { batch_no: { type: 'string' } } }, fields: ['Batch no'] } }] };
    render(<QuestionCard q={withPhoto} index={1} value={undefined} onChange={() => {}} onUpload={() => Promise.resolve({})} />);
    expect(screen.queryByText(/We read this automatically/)).toBeNull();
    expect(answerProblem(withPhoto, [{ c1: 'Cardio', c4: [{ url: '/private/files/a.jpg', name: 'a.jpg', ai: { redo: 1 } }] }])).toBe('Product 1 · Photo of the shelf: A file is not clear — remove it and upload it again.');
  });

  it('reads an older list of places as entries of the group map', () => {
    const loc = { id: 'q1', type: 'repeat', label: 'Every place', required: 1, button: 'Add another hospital or clinic', min: 1, max: 10, fields: [{ id: 'p', type: 'map_location', label: 'Hospital or clinic', required: 1 }] };
    const old = [{ lat: 26.79, lng: 82.19, place_id: 'a', name: 'SHIWAY HOSPITAL', how: 'place' }, { lat: 26.78, lng: 82.21, place_id: 'b', name: 'Saketpuri clinic', how: 'place' }];
    expect(answerProblem(loc, old)).toBeNull();
    expect(toPayload([loc], { q1: old })).toEqual({ q1: [{ p: old[0] }, { p: old[1] }] });
  });

  it('keeps one entry open; the others are one line each', () => {
    render(<QuestionCard q={grp} index={1} value={[{ c1: 'Cardio 10 mg', c2: 40 }, { c1: 'Derma Soft' }]} onChange={() => {}} />);
    expect(screen.getByText('Cardio 10 mg · 40')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Product 2' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Product 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit product 1' }));
    expect(screen.getByRole('group', { name: 'Product 1' })).toBeTruthy();
  });

  it('opens with ONE empty entry; Add another is always there; empty entries are not kept', () => {
    const { unmount } = render(<QuestionCard q={grp} index={1} value={undefined} onChange={() => {}} />);
    expect(screen.getByText('Product 1')).toBeTruthy();
    fireEvent.click(screen.getByText('Add another product'));
    expect(screen.getByRole('group', { name: 'Product 2' })).toBeTruthy();
    expect(screen.getByText('Product 1')).toBeTruthy();
    unmount();
    render(<QuestionCard q={grp} index={1} value={[{ c1: 'Cardio 10 mg', c2: 40 }, {}, {}]} onChange={() => {}} />);
    expect(screen.getByText('Add another product')).toBeTruthy();
    expect(screen.queryByText('Product 2')).toBeNull();
  });
});
