import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  BACK_LAYER_FLAG,
  backLeavesApp,
  claimPop,
  collapseHistory,
  holdBase,
  olderDocumentBehind,
  pushBase,
  pushLayer,
  releaseLayer,
  setFallback,
  __resetBackStack,
} from '../backStack';
import { useExitGuard } from '../useExitGuard';
import { AppExitGuard } from '../AppExitGuard';

/* The base of the stack on a browser that has CloseWatcher (every Android
   Chrome): the press the root and "back goes home" take without a history
   entry. jsdom has neither CloseWatcher nor the Navigation API, so both are
   stood in for here with the parts the stack reads. */

class FakeCloseWatcher {
  static all = [];

  constructor() {
    this.onclose = null;
    this.destroyed = false;
    FakeCloseWatcher.all.push(this);
  }

  destroy() {
    this.destroyed = true;
  }

  /** What the browser does on a back press: the newest watcher closes. */
  fire() {
    this.destroyed = true;
    this.onclose?.(new Event('close'));
  }
}

const liveWatchers = () => FakeCloseWatcher.all.filter((w) => !w.destroyed);

/* A back press as the browser delivers it: a live close watcher takes it
   first; otherwise history goes back and popstate fires, which the bubble
   listener standing in for the router may or may not hear. */
function pressBack() {
  const watchers = liveWatchers();
  if (watchers.length) {
    watchers[watchers.length - 1].fire();
    return { reachedRouter: false, byWatcher: true };
  }
  const beneath = { page: 'home' };
  window.history.replaceState(beneath, '');
  let reachedRouter = false;
  const router = () => {
    reachedRouter = true;
  };
  window.addEventListener('popstate', router);
  window.dispatchEvent(new PopStateEvent('popstate', { state: beneath, cancelable: true }));
  window.removeEventListener('popstate', router);
  return { reachedRouter, byWatcher: false };
}

function fakeNavigation(urls, index, sameDocument = () => true) {
  window.navigation = {
    currentEntry: { index },
    entries: () => urls.map((url, i) => ({ url, index: i, sameDocument: sameDocument(i) })),
  };
}

describe('the base on a browser with CloseWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetBackStack();
    FakeCloseWatcher.all = [];
    window.CloseWatcher = FakeCloseWatcher;
    window.history.replaceState({ page: 'home' }, '');
  });

  afterEach(() => {
    __resetBackStack();
    delete window.CloseWatcher;
    delete window.navigation;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('holds the press with a close watcher, not a history entry', () => {
    const before = window.history.length;
    pushBase({ onBack: vi.fn() });

    expect(liveWatchers()).toHaveLength(1);
    expect(window.history.length).toBe(before);
    expect(window.history.state?.[BACK_LAYER_FLAG]).toBeUndefined();
  });

  it('answers the first press at the root with the hint, and lets the second leave', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    act(() => {
      pressBack();
    });
    expect(result.current.hintOpen).toBe(true);

    const second = pressBack();
    expect(second.byWatcher).toBe(false);
    expect(second.reachedRouter).toBe(true);
  });

  it('asks again after the window, with no gesture in between', () => {
    /* The case that failed on handsets: re-arming after a back press. A close
       watcher needs no gesture, so the press after the window is held again. */
    const { result } = renderHook(() => useExitGuard({ isRoot: true, graceMs: 3000 }));

    act(() => {
      pressBack();
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.hintOpen).toBe(false);
    expect(liveWatchers()).toHaveLength(1);

    act(() => {
      pressBack();
    });
    expect(result.current.hintOpen).toBe(true);
  });

  it('takes the press back when the reader says Stay', () => {
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    act(() => {
      pressBack();
    });
    act(() => result.current.stay());

    expect(result.current.hintOpen).toBe(false);
    expect(pressBack().byWatcher).toBe(true);
  });

  it('stands down while a layer is above it, and comes back when it closes', () => {
    // A watcher would get the press ahead of the dialog's history entry.
    pushBase({ onBack: vi.fn() });
    const dialog = pushLayer({ onBack: vi.fn(), name: 'dialog' });

    expect(liveWatchers()).toHaveLength(0);

    dialog.release();
    expect(liveWatchers()).toHaveLength(1);
  });

  it('stands down while a foreign overlay holds it', () => {
    pushBase({ onBack: vi.fn() });

    const release = holdBase();
    expect(liveWatchers()).toHaveLength(0);

    release();
    release(); // a second release is a no-op, not a second unhold
    expect(liveWatchers()).toHaveLength(1);
  });

  it('keeps one base: a new one replaces the old', () => {
    const first = vi.fn();
    const second = vi.fn();
    pushBase({ onBack: first });
    pushBase({ onBack: second });

    expect(liveWatchers()).toHaveLength(1);
    pressBack();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('folds the history behind the root when the hint goes up', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/login', 'https://app.test/visit', 'https://app.test/'], 3);
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    renderHook(() => useExitGuard({ isRoot: true }));

    act(() => {
      pressBack();
    });

    expect(go).toHaveBeenCalledWith(-3);
  });
});

describe('collapseHistory', () => {
  beforeEach(() => {
    __resetBackStack();
    window.history.replaceState({ page: 'home', [BACK_LAYER_FLAG]: 'app-root-9' }, '');
  });

  afterEach(() => {
    __resetBackStack();
    delete window.navigation;
    vi.restoreAllMocks();
  });

  it('goes back to the first entry of this document and rewrites it as the current page', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/login', 'https://app.test/'], 2);
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    const href = window.location.href;

    expect(collapseHistory()).toBe(true);
    expect(go).toHaveBeenCalledWith(-2);

    // The traversal lands: the router must not hear it, and the entry becomes the page we left.
    window.history.replaceState({ page: 'login' }, '');
    let reachedRouter = false;
    const router = () => {
      reachedRouter = true;
    };
    window.addEventListener('popstate', router);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'login' } }));
    window.removeEventListener('popstate', router);

    expect(reachedRouter).toBe(false);
    expect(window.history.state).toEqual({ page: 'home' });
    expect(window.location.href).toBe(href);
  });

  it('stops at an older document, which would load rather than fold', () => {
    fakeNavigation(['https://app.test/a', 'https://app.test/b', 'https://app.test/'], 2, (i) => i >= 1);
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});

    expect(collapseHistory()).toBe(true);
    expect(go).toHaveBeenCalledWith(-1);
  });

  it('does nothing on the first entry, or without the Navigation API', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    expect(collapseHistory()).toBe(false);

    fakeNavigation(['https://app.test/'], 0);
    expect(collapseHistory()).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });
});

describe('backLeavesApp', () => {
  afterEach(() => {
    delete window.navigation;
  });

  it('is unknown without the Navigation API', () => {
    expect(backLeavesApp(['/login'])).toBeUndefined();
  });

  it('is true on the first entry', () => {
    fakeNavigation(['https://app.test/visit'], 0);
    expect(backLeavesApp(['/login'])).toBe(true);
  });

  it('is true with only the login page behind', () => {
    fakeNavigation(['https://app.test/login/', 'https://app.test/visit'], 1);
    expect(backLeavesApp(['/login'])).toBe(true);
  });

  it('is false with a real page behind', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/visit'], 1);
    expect(backLeavesApp(['/login'])).toBe(false);
  });

  it('counts every page under a blocked path, not just the path itself', () => {
    // The app's login page is /login/[id]/[name]/[reason], not /login.
    fakeNavigation(['https://app.test/login/%5Bid%5D/%5Bname%5D/%5Breason%5D', 'https://app.test/'], 1);
    expect(backLeavesApp(['/login'])).toBe(true);

    fakeNavigation(['https://app.test/loginhelp', 'https://app.test/'], 1);
    expect(backLeavesApp(['/login'])).toBe(false);
  });
});

describe('olderDocumentBehind', () => {
  afterEach(() => {
    delete window.navigation;
  });

  it('is true when a full page load sits behind this document', () => {
    // Seen on a handset: [/ (older load), /login/…, /] after signing in.
    fakeNavigation(['https://app.test/', 'https://app.test/login/x', 'https://app.test/'], 2, (i) => i >= 1);
    expect(olderDocumentBehind()).toBe(true);
  });

  it('is false when everything behind is this document', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/visit', 'https://app.test/'], 2);
    expect(olderDocumentBehind()).toBe(false);
  });
});

describe('claimPop: a router that hears popstate before the stack does', () => {
  /* Next's pages router: its popstate listener is registered first and, on
     Chrome, runs first — stopping the event in ours is too late. It asks
     claimPop from beforePopState instead and skips the route on true. */
  let routed;
  const router = () => {
    if (claimPop()) return;
    routed += 1;
  };

  beforeEach(() => {
    __resetBackStack();
    routed = 0;
    window.history.replaceState({ page: 'home' }, '');
    window.addEventListener('popstate', router); // before the stack listens
  });

  afterEach(() => {
    window.removeEventListener('popstate', router);
    __resetBackStack();
    delete window.navigation;
    vi.restoreAllMocks();
  });

  const pop = (state = { page: 'home' }) => {
    window.history.replaceState(state, '');
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  };

  it('keeps the router off a press a layer takes, and runs the layer once', () => {
    const onBack = vi.fn();
    pushLayer({ onBack, name: 'dialog' });

    pop();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(routed).toBe(0);
  });

  it('keeps the router off our own fold, so it cannot route to the page folded over', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/login/x', 'https://app.test/'], 2);
    vi.spyOn(window.history, 'go').mockImplementation(() => {});
    collapseHistory();

    pop({ page: 'login' });

    expect(routed).toBe(0);
    expect(window.history.state?.page).toBe('home');
  });

  it('keeps the router off a dialog taking its own entry back', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const dialog = pushLayer({ onBack: vi.fn(), name: 'dialog' });
    releaseLayer(dialog.id);

    pop();

    expect(routed).toBe(0);
  });

  it('keeps the router off a press the fallback refuses', () => {
    setFallback((event) => {
      event.stopImmediatePropagation();
      return true;
    });

    pop({ page: 'login' });

    expect(routed).toBe(0);
  });

  it('lets an ordinary press through to the router exactly once', () => {
    setFallback(() => false);

    pop();

    expect(routed).toBe(1);
  });
});

describe('the press after a hint that loaded an older document', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetBackStack();
    FakeCloseWatcher.all = [];
    window.CloseWatcher = FakeCloseWatcher;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    __resetBackStack();
    delete window.CloseWatcher;
    delete window.navigation;
    window.sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leaves a note when an older load sits behind home', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/login/x', 'https://app.test/'], 2, (i) => i >= 1);
    vi.spyOn(window.history, 'go').mockImplementation(() => {});
    renderHook(() => useExitGuard({ isRoot: true }));

    act(() => {
      pressBack();
    });

    expect(window.sessionStorage.getItem('elbrit-back-exit-pending')).not.toBeNull();
  });

  it('comes up showing the hint, disarmed, in the document that press loaded', () => {
    window.sessionStorage.setItem('elbrit-back-exit-pending', String(Date.now()));
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    expect(result.current.hintOpen).toBe(true);
    expect(liveWatchers()).toHaveLength(0); // the next press leaves
    expect(window.sessionStorage.getItem('elbrit-back-exit-pending')).toBeNull();
  });

  it('ignores a stale note', () => {
    window.sessionStorage.setItem('elbrit-back-exit-pending', String(Date.now() - 60000));
    const { result } = renderHook(() => useExitGuard({ isRoot: true }));

    expect(result.current.hintOpen).toBe(false);
    expect(liveWatchers()).toHaveLength(1);
  });
});

describe('a sentinel left behind by a layer that is gone', () => {
  beforeEach(() => {
    __resetBackStack();
  });

  afterEach(() => __resetBackStack());

  it('is taken over by the next layer instead of stacking another entry', () => {
    /* Coming back to a page by back lands on the old root's sentinel. Pushing
       another one there would be a push with no gesture — skipped by Chromium. */
    window.history.replaceState({ page: 'home', [BACK_LAYER_FLAG]: 'app-root-41' }, '');
    const before = window.history.length;

    const layer = pushLayer({ onBack: vi.fn(), name: 'app-root' });

    expect(window.history.length).toBe(before);
    expect(window.history.state?.[BACK_LAYER_FLAG]).toBe(layer.id);
    expect(window.history.state?.page).toBe('home');
  });

  it('is not taken over while its own pop is still on the way', () => {
    // A dialog closed by its X takes its entry back off; arming onto it would lose ours.
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    window.history.replaceState({ page: 'home' }, '');
    const dialog = pushLayer({ onBack: vi.fn(), name: 'dialog' });
    const before = window.history.length;

    dialog.release();
    const root = pushLayer({ onBack: vi.fn(), name: 'app-root' });

    expect(window.history.length).toBe(before + 1);
    expect(window.history.state?.[BACK_LAYER_FLAG]).toBe(root.id);

    // The dialog's pop lands, as the browser would deliver it.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'home' } }));
    vi.restoreAllMocks();
  });
});

describe('AppExitGuard off the root', () => {
  beforeEach(() => {
    __resetBackStack();
    FakeCloseWatcher.all = [];
    window.CloseWatcher = FakeCloseWatcher;
    window.history.replaceState({ page: 'visit' }, '');
  });

  afterEach(() => {
    __resetBackStack();
    delete window.CloseWatcher;
    delete window.navigation;
  });

  it('sends back home from a page with nothing behind it', () => {
    fakeNavigation(['https://app.test/visit'], 0);
    const onLeave = vi.fn();
    render(<AppExitGuard pathname="/visit" rootPaths={['/']} onLeave={onLeave} blockedPaths={['/login']} />);

    act(() => {
      pressBack();
    });

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends back home rather than to the login page', () => {
    fakeNavigation(['https://app.test/login', 'https://app.test/visit'], 1);
    const onLeave = vi.fn();
    render(<AppExitGuard pathname="/visit" rootPaths={['/']} onLeave={onLeave} blockedPaths={['/login']} />);

    act(() => {
      pressBack();
    });

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('leaves an ordinary back alone', () => {
    fakeNavigation(['https://app.test/', 'https://app.test/visit'], 1);
    const onLeave = vi.fn();
    render(<AppExitGuard pathname="/visit" rootPaths={['/']} onLeave={onLeave} blockedPaths={['/login']} />);

    expect(liveWatchers()).toHaveLength(0);
    expect(pressBack().reachedRouter).toBe(true);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
