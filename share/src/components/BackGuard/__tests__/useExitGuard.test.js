import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useExitGuard } from '../useExitGuard';
import { BACK_LAYER_FLAG, __resetBackStack } from '../backStack';

/* The grace window IS the exit. Too eager and the app closes on one press
   again; never re-armed and the app can never be left at all. Neither shows
   up on screen. */

function pressBack() {
  const beneath = { page: 'home' };
  window.history.replaceState(beneath, '');
  const event = new PopStateEvent('popstate', { state: beneath, cancelable: true });
  let reachedRouter = false;
  const router = () => {
    reachedRouter = true;
  };
  window.addEventListener('popstate', router);
  window.dispatchEvent(event);
  window.removeEventListener('popstate', router);
  return { reachedRouter };
}

describe('useExitGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetBackStack();
    window.history.replaceState({ page: 'home' }, '');
  });

  afterEach(() => {
    __resetBackStack();
    vi.useRealTimers();
  });

  it('answers the first press with the hint instead of leaving', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    const first = act(() => pressBack());

    expect(result.current.hintOpen).toBe(true);
    expect(first?.reachedRouter ?? false).toBe(false);
  });

  it('lets the second press leave for real', () => {
    /* The only thing that closes an installed app is a press the page does
       not consume, so the second one has to reach the browser untouched. */
    renderHook(() => useExitGuard({ isRoot: true }));

    act(() => pressBack());
    const second = pressBack();

    expect(second.reachedRouter).toBe(true);
  });

  it('asks again once the window has passed', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: true, graceMs: 3000 }));

    act(() => pressBack());
    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.hintOpen).toBe(false);
    expect(window.history.state?.[BACK_LAYER_FLAG]).toMatch(/^app-root-/);

    act(() => pressBack());
    expect(result.current.hintOpen).toBe(true);
  });

  it('takes the gesture back when the reader says Stay', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    act(() => pressBack());
    act(() => result.current.stay());

    expect(result.current.hintOpen).toBe(false);
    const after = pressBack();
    expect(after.reachedRouter).toBe(false);
  });

  it('tells the host the moment the hint goes up', () => {
    // A native shell that CAN close itself gets its one chance here.
    const onPrompt = vi.fn();
    renderHook(() => useExitGuard({ isRoot: true, onPrompt }));

    act(() => pressBack());

    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('guards nothing off the root', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: false }));

    expect(window.history.state?.[BACK_LAYER_FLAG]).toBeUndefined();
    const press = pressBack();

    expect(press.reachedRouter).toBe(true);
    expect(result.current.hintOpen).toBe(false);
  });

  it('guards nothing when switched off', () => {
    const { result } = renderHook(() => useExitGuard({ enabled: false, isRoot: true }));

    expect(window.history.state?.[BACK_LAYER_FLAG]).toBeUndefined();
    expect(pressBack().reachedRouter).toBe(true);
    expect(result.current.hintOpen).toBe(false);
  });

  it('drops the hint when the screen stops being the root', () => {
    // Navigating away mid-window must not leave a toast behind on the next page.
    const { result, rerender } = renderHook(({ isRoot }) => useExitGuard({ isRoot }), {
      initialProps: { isRoot: true },
    });

    act(() => pressBack());
    expect(result.current.hintOpen).toBe(true);

    rerender({ isRoot: false });
    expect(result.current.hintOpen).toBe(false);
  });
});
