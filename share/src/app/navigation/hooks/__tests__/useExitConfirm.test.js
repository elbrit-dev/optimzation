import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useExitConfirm } from '../useExitConfirm';

/* The whole mechanism is one history entry and one popstate, and both are
   invisible on screen — which is exactly why they are worth a test. A guard
   that stops being pushed turns the back press back into an instant exit and
   nothing about the UI would look different. */

const GUARD_KEY = '__elbritExitGuard';

function pressBack() {
  /* What the browser does to us: the sentinel entry comes off (same URL, so
     no re-render) and popstate fires on the entry beneath it. */
  window.history.replaceState({ page: 'home' }, '');
  window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'home' } }));
}

describe('useExitConfirm', () => {
  beforeEach(() => {
    window.history.replaceState({ page: 'home' }, '');
  });

  it('guards the exit route with a sentinel history entry', () => {
    renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true }));
    expect(window.history.state?.[GUARD_KEY]).toBe(true);
  });

  it('keeps the router state Next put there, rather than replacing it', () => {
    // Dropping Next's own keys breaks App Router navigation on the next push.
    renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true }));
    expect(window.history.state?.page).toBe('home');
  });

  it('asks instead of leaving when back is pressed', () => {
    const { result } = renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true }));

    act(() => pressBack());

    expect(result.current.exitConfirmOpen).toBe(true);
    expect(window.history.state?.[GUARD_KEY]).toBe(true);
  });

  it('stays guarded after the reader cancels, so the next back asks again', () => {
    const { result } = renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true }));

    act(() => pressBack());
    act(() => result.current.cancelExit());

    expect(result.current.exitConfirmOpen).toBe(false);
    expect(window.history.state?.[GUARD_KEY]).toBe(true);

    act(() => pressBack());
    expect(result.current.exitConfirmOpen).toBe(true);
  });

  it('hands the close to the host when one is wired up', () => {
    const onExit = vi.fn();
    const back = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    const { result } = renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true, onExit }));

    act(() => pressBack());
    act(() => result.current.confirmExit());

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('steps past the sentinel AND the route itself when nothing else handles it', () => {
    // -1 would only land back on the route the reader is trying to leave.
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    const { result } = renderHook(() => useExitConfirm({ enabled: true, isExitRoute: true }));

    act(() => pressBack());
    act(() => result.current.confirmExit());

    expect(go).toHaveBeenCalledWith(-2);
    go.mockRestore();
  });

  it('leaves back alone off the exit route', () => {
    const { result } = renderHook(() => useExitConfirm({ enabled: true, isExitRoute: false }));

    expect(window.history.state?.[GUARD_KEY]).toBeUndefined();
    act(() => pressBack());
    expect(result.current.exitConfirmOpen).toBe(false);
  });

  it('leaves back alone when the confirmation is switched off', () => {
    const { result } = renderHook(() => useExitConfirm({ enabled: false, isExitRoute: true }));

    expect(window.history.state?.[GUARD_KEY]).toBeUndefined();
    act(() => pressBack());
    expect(result.current.exitConfirmOpen).toBe(false);
  });
});
