import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyPage } from '../components/SurveyPage';
import { createSurveyApi } from '../api';
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
