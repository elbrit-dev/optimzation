import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyPage } from '../components/SurveyPage';
import { createSurveyApi } from '../api';
import { surveysFromMyList } from '../data/shape';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/* SurveyPage — one survey on its own page (/survey/<campaign>). */

const RX = 'SC-2026-0031'; // Rx audit — vascular range, sent to BE
const NOT_SENT_TO_BE = 'SC-2026-0035'; // Field app feedback: ABM / RBM only

function setup(props = {}, options = {}) {
  const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0, ...options });
  const onBack = vi.fn();
  const utils = render(<SurveyPage api={api} campaign={RX} today="2026-11-11" onBack={onBack} {...props} />);
  return { ...utils, onBack };
}

beforeEach(() => {
  window.history.replaceState(null, '', `/survey/${RX}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SurveyPage — one survey, its own page', () => {
  it('opens the survey named by campaign — header, its doctors — and no strip', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('a row opens its form; the form’s Back returns to the survey', async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await user.click(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    expect(await screen.findByRole('heading', { name: /Rx audit.*Dr\. Joseph Prabhu/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Dr\. Joseph Prabhu/ })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('asks before leaving a form with unsaved answers', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
  });

  it('Back from the survey fires onBack', async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
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

describe('SurveyPage — the phone’s / browser’s back works like the in-page ←', () => {
  const PRABHU = /^Dr\. Joseph Prabhu/;
  const FORM = { name: /Rx audit.*Dr\. Joseph Prabhu/ };
  const SURVEY = { name: 'Rx audit — vascular range' };

  async function responseOf(label) {
    const list = await createSurveyApi({ source: 'mock', role: 'BE', delay: 0 }).getMyList();
    const survey = surveysFromMyList(list).find((s) => s.campaign === RX);
    return survey.rows.find((r) => r.subject?.label === label).response;
  }
  const browserBack = () => act(() => window.history.back());
  const row = () => new URLSearchParams(window.location.search).get('r');

  it('opening a form adds ?r=; the browser’s back closes it and shows the survey', async () => {
    const user = userEvent.setup();
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    const { onBack } = setup();
    const before = window.history.length;
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    expect(await screen.findByRole('heading', FORM)).toBeTruthy();
    await waitFor(() => expect(row()).toBe(prabhu));
    expect(window.history.length).toBe(before + 1);
    await browserBack();
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    expect(screen.queryByRole('heading', FORM)).toBeNull();
    expect(row()).toBeNull();
    expect(window.location.pathname).toBe(`/survey/${RX}`);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('the in-page ← on a form is the same history back — ?r= goes, nothing piles up', async () => {
    const user = userEvent.setup();
    setup();
    const before = window.history.length;
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await waitFor(() => expect(row()).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    await waitFor(() => expect(row()).toBeNull());
    /* Open it again: the same single entry on top, not a second one. */
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await waitFor(() => expect(row()).not.toBeNull());
    expect(window.history.length).toBe(before + 1);
  });

  it('unsaved answers: the browser’s back asks; Keep editing stays on the form, ?r= put back', async () => {
    const user = userEvent.setup();
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    setup();
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await browserBack();
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    expect(screen.getByRole('heading', { ...FORM, hidden: true })).toBeTruthy(); // under the modal sheet
    await waitFor(() => expect(row()).toBe(prabhu));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(screen.getByRole('heading', FORM)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ticagrelor', checked: true })).toBeTruthy(); // the answer kept
    expect(row()).toBe(prabhu);
  });

  it('unsaved answers: the browser’s back, then Discard, goes to the survey', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await browserBack();
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    await waitFor(() => expect(row()).toBeNull());
  });

  it('unsaved answers: the in-page ← asks too; Keep editing stays, Discard goes to the survey', async () => {
    const user = userEvent.setup();
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    setup();
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(screen.getByRole('heading', FORM)).toBeTruthy();
    expect(row()).toBe(prabhu);
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    await waitFor(() => expect(row()).toBeNull());
  });

  it('a direct link with ?r= opens that form, with the survey behind it', async () => {
    const user = userEvent.setup();
    const prabhu = await responseOf('Dr. Joseph Prabhu');
    window.history.replaceState(null, '', `/survey/${RX}?r=${encodeURIComponent(prabhu)}`);
    setup();
    expect(await screen.findByRole('heading', FORM)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    expect(row()).toBeNull();
  });

  it('a direct link with an unknown ?r= shows the survey, and drops it from the URL', async () => {
    window.history.replaceState(null, '', `/survey/${RX}?r=SR-NOT-MINE`);
    setup();
    expect(await screen.findByRole('heading', SURVEY)).toBeTruthy();
    expect(screen.getByRole('button', { name: PRABHU })).toBeTruthy();
    await waitFor(() => expect(row()).toBeNull());
  });

  it('the survey’s ← still fires onBack', async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await user.click(await screen.findByRole('button', { name: PRABHU }));
    await browserBack();
    await screen.findByRole('heading', SURVEY);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
