import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyPage } from '../components/SurveyPage';
import { createSurveyApi } from '../api';
import { surveysFromMyList } from '../data/shape';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/* SurveyPage — one survey on ONE page (/survey/<campaign>), 26 Nov 2026 — Survey Studio layout:
   ← Survey › Dr name · "N of M doctors done" + History · N · the doctors still to do as tags (+ Done · N) ·
   the picked doctor's questions. History shows the submitted ones. A tag shows that doctor right here; Back leaves. */

const RX = 'SC-2026-0031'; // Rx audit — vascular range, sent to BE: Anitha (submitted), Prabhu, Meenakshi, Arul (to do)
const NOT_SENT_TO_BE = 'SC-2026-0035'; // Field app feedback: ABM / RBM only
const SURVEY = { name: /^Rx audit — vascular range/ };

function setup(props = {}, options = {}) {
  const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0, ...options });
  const onBack = vi.fn();
  const utils = render(<SurveyPage api={api} campaign={RX} today="2026-11-11" onBack={onBack} {...props} />);
  return { ...utils, onBack };
}
async function responseOf(label) {
  const list = await createSurveyApi({ source: 'mock', role: 'BE', delay: 0 }).getMyList();
  return surveysFromMyList(list).find((s) => s.campaign === RX).rows.find((r) => r.subject?.label === label).response;
}
const row = () => new URLSearchParams(window.location.search).get('r');
const history = () => screen.getByRole('button', { name: /^History, \d+ done$/ });
const header = () => screen.getByRole('heading', SURVEY).textContent;
const doctorTags = () => screen.getByRole('tablist', { name: /^Doctors: / });
const tagTitles = () => within(doctorTags()).getAllByRole('tab').map((t) => t.getAttribute('title'));
const pickedTag = () => within(doctorTags()).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.getAttribute('title');

beforeEach(() => {
  window.history.replaceState(null, '', `/survey/${RX}`);
  window.localStorage.clear(); // answers saved for later, from an earlier test
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SurveyPage — one page per survey', () => {
  it('opens on its first doctor to do: "Survey › Dr name", N of M done with History, the doctors to do as tags, that doctor’s questions', async () => {
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    setup();
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    expect(header()).toBe('Rx audit — vascular rangeDr. Joseph Prabhu'); // "Survey › Dr name" (the › is an icon)
    expect(history().textContent).toBe('History · 1');
    expect(history().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/of 4 done/)).toBeTruthy();
    expect(screen.queryByText(/to do · next/)).toBeNull(); // 28 Nov 2026: the count and the tags say it
    expect(tagTitles()).toEqual(['Dr. Joseph Prabhu', 'Dr. Meenakshi Sundar', 'Dr. Arul Selvan']);
    expect(screen.getByRole('button', { name: /^Done · 1$/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ticagrelor' })).toBeTruthy(); // the doctor's questions, on this page
    expect(screen.queryByText('Pre-tag')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    await waitFor(() => expect(row()).toBe(prabhu));
  });

  it('a tag shows that doctor right here — the title stays, no history entry is added', async () => {
    const user = userEvent.setup();
    const meenakshi = await responseOf('Dr. Meenakshi Sundar');
    setup();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    const before = window.history.length;
    await user.click(within(doctorTags()).getByRole('tab', { name: /Meenakshi/ }));
    expect(pickedTag()).toBe('Dr. Meenakshi Sundar');
    expect(header()).toBe('Rx audit — vascular rangeDr. Meenakshi Sundar');
    await waitFor(() => expect(row()).toBe(meenakshi));
    expect(window.history.length).toBe(before);
  });

  it('History shows the sent ones (their answers, read-only); "To do" goes back', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    await user.click(history());
    expect(history().getAttribute('aria-pressed')).toBe('true');
    /* 28 Nov 2026 · History is a list; the open doctor's answers show under its row, a tap closes them */
    const list = await screen.findByRole('list', { name: /submitted/ });
    const anitha = within(list).getByRole('button', { name: /Dr\. Anitha Rajan/ });
    await waitFor(() => expect(anitha.getAttribute('aria-expanded')).toBe('true'));
    expect(screen.getByText('1 submitted')).toBeTruthy();
    expect(screen.queryByText(/these are the answers you sent/)).toBeNull();
    await user.click(anitha);
    expect(anitha.getAttribute('aria-expanded')).toBe('false');
    await user.click(screen.getByRole('button', { name: /^To do · 3$/ }));
    expect(tagTitles()).toEqual(['Dr. Joseph Prabhu', 'Dr. Meenakshi Sundar', 'Dr. Arul Selvan']);
  });

  it('Back leaves the survey (onBack)', async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Back with unsaved answers asks first — Keep editing stays; Save for later keeps them and leaves', async () => {
    const user = userEvent.setup();
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    const { onBack } = setup();
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Leave this form?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Leave this form?')).toBeNull());
    expect(screen.getByRole('radio', { name: 'Ticagrelor', checked: true })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'Save for later' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    const saved = Object.keys(window.localStorage).map((k) => JSON.parse(window.localStorage.getItem(k) || '{}'));
    expect(saved.some((d) => d && d[prabhu])).toBe(true);
  });

  it('moving to another doctor keeps the unsent answers as a draft', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(within(doctorTags()).getByRole('tab', { name: /Meenakshi/ }));
    expect(await screen.findByText('Your unsent answers were saved for later on this device.')).toBeTruthy();
    expect(screen.queryByText('Leave this form?')).toBeNull();
    await user.click(within(doctorTags()).getByRole('tab', { name: /Joseph/ }));
    expect(await screen.findByRole('radio', { name: 'Ticagrelor', checked: true })).toBeTruthy();
  });

  it('Submit sends and shows the next one still to do', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    await user.click(screen.getByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('radio', { name: '3' }));
    await user.type(screen.getByRole('textbox', { name: 'New patients started on a statin, per week' }), '4');
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    fireEvent.change(screen.getByLabelText('Date of the visit'), { target: { value: '2026-11-11' } });
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Sent for Dr. Joseph Prabhu. Next: Dr. Meenakshi Sundar.')).toBeTruthy();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Meenakshi Sundar'));
    expect(header()).toBe('Rx audit — vascular rangeDr. Meenakshi Sundar');
    await waitFor(() => expect(history().textContent).toBe('History · 2'));
    expect(tagTitles()).toEqual(['Dr. Meenakshi Sundar', 'Dr. Arul Selvan']);
  });

  it('a link with ?r= opens that doctor — a submitted one in History', async () => {
    const anitha = await responseOf('Dr. Anitha Rajan');
    window.history.replaceState(null, '', `/survey/${RX}?r=${encodeURIComponent(anitha)}`);
    setup();
    const list = await screen.findByRole('list', { name: /submitted/ });
    await waitFor(() => expect(within(list).getByRole('button', { name: /Dr\. Anitha Rajan/ }).getAttribute('aria-expanded')).toBe('true'));
    expect(history().getAttribute('aria-pressed')).toBe('true');
    expect(row()).toBe(anitha);
  });

  it('an unknown ?r= opens the first one to do', async () => {
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    window.history.replaceState(null, '', `/survey/${RX}?r=SR-NOT-MINE`);
    setup();
    await waitFor(() => expect(pickedTag()).toBe('Dr. Joseph Prabhu'));
    await waitFor(() => expect(row()).toBe(prabhu));
  });

  it('an unknown campaign is not available — with a Back that fires onBack', async () => {
    const user = userEvent.setup();
    const { onBack } = setup({ campaign: 'SC-9999-0001' });
    expect(await screen.findByText('This survey isn’t available')).toBeTruthy();
    expect(screen.getByText('It may be closed, or not sent to you.')).toBeTruthy();
    const backs = screen.getAllByRole('button', { name: 'Back' });
    await user.click(backs[backs.length - 1]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a survey not sent to the person is not available', async () => {
    setup({ campaign: NOT_SENT_TO_BE });
    expect(await screen.findByText('This survey isn’t available')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Field app feedback' })).toBeNull();
  });

  it('asks to sign in when there is no token — and calls nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<SurveyPage campaign={RX} gqlEnvironment="UAT" />);
    expect(await screen.findByText('Sign in to see your surveys')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the ERP cannot be reached, with Try again', async () => {
    setup({}, { scenario: 'error' });
    expect(await screen.findByText('Couldn’t load this survey')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('SurveyPage — the ERP it calls', () => {
  const UAT = 'https://erp-uat.example.org/api/method/graphql';

  it('refuses a gqlEnvironment that is not a /tokens row name exactly — nothing is sent', async () => {
    /* The registry answers an unknown name with its default row. */
    getEndpointConfigFromUrlKeyAsync.mockResolvedValue({ endpointUrl: 'https://erp.example.org/api/method/graphql', authToken: '', name: 'ERP' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<SurveyPage campaign={RX} gqlToken="k:s" gqlEnvironment="UATT" />);
    expect(await screen.findByText(/No ERP named "UATT" in \/tokens/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads survey_my_list as the person from the row named exactly', async () => {
    getEndpointConfigFromUrlKeyAsync.mockResolvedValue({ endpointUrl: UAT, authToken: '', name: 'UAT' });
    const myList = await createSurveyApi({ source: 'mock', role: 'BE', delay: 0 }).getMyList();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ message: myList }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SurveyPage campaign={RX} gqlToken="k:s" gqlEnvironment="UAT" today="2026-11-11" />);
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://erp-uat.example.org/api/method/survey_my_list');
    expect(init.headers.Authorization).toBe('token k:s');
  });
});
