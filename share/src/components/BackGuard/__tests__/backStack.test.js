import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  BACK_LAYER_FLAG,
  pushLayer,
  setFallback,
  __resetBackStack,
} from '../backStack';

/* The whole mechanism is one history entry and one popstate, and both are
   invisible on screen — which is why they are worth a test. A layer that
   stops arming turns the back press back into an instant exit, and nothing
   about the UI would look different. */

function pressBack() {
  /* What the browser does to us: the top sentinel comes off (same URL, so no
     re-render) and popstate fires on the entry beneath it. */
  const beneath = { page: 'home' };
  window.history.replaceState(beneath, '');
  const event = new PopStateEvent('popstate', { state: beneath, cancelable: true });
  let reachedRouter = false;
  /* A bubble-phase listener stands in for Next's router: if the stack did its
     job with stopImmediatePropagation, this never runs. */
  const router = () => {
    reachedRouter = true;
  };
  window.addEventListener('popstate', router);
  window.dispatchEvent(event);
  window.removeEventListener('popstate', router);
  return { reachedRouter };
}

describe('backStack', () => {
  beforeEach(() => {
    __resetBackStack();
    window.history.replaceState({ page: 'home' }, '');
  });

  afterEach(() => __resetBackStack());

  it('arms a sentinel the moment a layer is pushed', () => {
    const layer = pushLayer({ onBack: vi.fn(), name: 'dialog' });
    expect(window.history.state?.[BACK_LAYER_FLAG]).toBe(layer.id);
  });

  it('keeps the router state Next put there, rather than replacing it', () => {
    // Dropping Next's own keys makes the URL and the rendered page drift apart.
    pushLayer({ onBack: vi.fn() });
    expect(window.history.state?.page).toBe('home');
  });

  it('gives the press to the layer and not to the router', () => {
    const onBack = vi.fn();
    pushLayer({ onBack });

    const { reachedRouter } = pressBack();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(reachedRouter).toBe(false);
  });

  it('gives the press to the innermost layer only', () => {
    // A popover over a dialog: back dismisses the popover, not the dialog.
    const outer = vi.fn();
    const inner = vi.fn();
    pushLayer({ onBack: outer, name: 'dialog' });
    pushLayer({ onBack: inner, name: 'popover' });

    pressBack();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('hands the next press down once the innermost layer releases', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    pushLayer({ onBack: outer, name: 'dialog' });
    const innerLayer = pushLayer({ onBack: inner, name: 'popover' });

    pressBack();
    innerLayer.release();
    pressBack();

    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('re-arms on request, so a layer can hold the gesture again', () => {
    const layer = pushLayer({ onBack: ({ rearm }) => rearm() });

    pressBack();

    expect(window.history.state?.[BACK_LAYER_FLAG]).toBe(layer.id);
  });

  it('lets the press through when the layer does not re-arm', () => {
    /* This is the exit: a press nobody consumes is the only thing that closes
       an installed app, so "disarmed" has to mean the router sees it. */
    pushLayer({ onBack: () => {} });

    pressBack();
    const second = pressBack();

    expect(second.reachedRouter).toBe(true);
  });

  it('takes its history entry back when a layer is released', () => {
    // Closing a dialog through its own X must cost the history what it added.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const layer = pushLayer({ onBack: vi.fn() });

    layer.release();

    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('leaves the history alone when the sentinel is already gone', () => {
    const layer = pushLayer({ onBack: () => {} });
    pressBack(); // the sentinel came off here
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    layer.release();

    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('leaves a press alone when something not on this stack is above us', () => {
    /* The calendar's overlay hook and Secondary Entry's unsaved guard still
       keep their own history entries. One of those on top means the press is
       theirs, and our sentinel is still the current entry when it pops. */
    const onBack = vi.fn();
    const layer = pushLayer({ onBack });
    // Their entry, pushed above ours; popping it lands back on OUR sentinel.
    const ours = { page: 'home', [BACK_LAYER_FLAG]: layer.id };
    window.history.replaceState(ours, '');
    const event = new PopStateEvent('popstate', { state: ours, cancelable: true });
    let reachedThem = false;
    const theirHandler = () => {
      reachedThem = true;
    };
    window.addEventListener('popstate', theirHandler, true);
    window.dispatchEvent(event);
    window.removeEventListener('popstate', theirHandler, true);

    expect(onBack).not.toHaveBeenCalled();
    expect(reachedThem).toBe(true);
  });

  it('offers unclaimed presses to the app-level rule', () => {
    // The other app refuses a back press INTO the login page this way.
    const fallback = vi.fn();
    setFallback(fallback);

    pressBack();

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('keeps unclaimed presses away from the rule while a layer holds them', () => {
    const fallback = vi.fn();
    setFallback(fallback);
    pushLayer({ onBack: ({ rearm }) => rearm() });

    pressBack();

    expect(fallback).not.toHaveBeenCalled();
  });

  it('re-arms on a gesture, because Chromium skips untouched sentinels', () => {
    /* Chrome's history-manipulation intervention flags entries pushed with no
       user activation; the flag clears on the first gesture, and re-arming
       then is what makes a cold start behave like a warm one. */
    const layer = pushLayer({ onBack: () => {} });
    pressBack(); // disarmed, sentinel gone

    window.dispatchEvent(new Event('pointerdown'));

    expect(window.history.state?.[BACK_LAYER_FLAG]).toBe(layer.id);
  });
});
