/* backStack — ONE owner of the back gesture for the whole app.

   There were four of these before: Navigation's exit confirm, the calendar's
   overlay hook, Secondary Entry's unsaved guard, and (in the other app) a
   PWA root guard — two of them pushing a sentinel under the SAME history-state
   key, each with its own popstate listener, none of them aware of the others.
   Back is a single, serial gesture; it needs a single, serial owner.

   THE MODEL IS A STACK OF LAYERS, innermost last. Whoever is on top gets the
   press. An open date popover sits above the dialog that opened it, which sits
   above the screen's unsaved guard, which sits above the app root — and back
   unwinds them one at a time, which is what a phone user means by back.

   EACH LAYER OWNS ONE THROWAWAY HISTORY ENTRY ("its sentinel"), flagged with
   the layer's id. Back pops the sentinel, we hear popstate, and because the
   URL did not change nothing re-renders. The listener is CAPTURE phase and
   stops the event there, so the router (a bubble-phase listener on the same
   window) never sees the pop and the route stays put.

   The sentinel state is SPREAD from whatever is already there, so Next's own
   router keys (`__N`, the App Router cache key) survive. Replacing the state
   object outright makes the URL and the rendered page drift apart.

   LEAVING IS A DISARMED PRESS, not an API call. No web page can close itself:
   at history entry 0 `go(-1)` does nothing and Chromium refuses
   `window.close()`. The OS closes a PWA on a back press THE PAGE DOES NOT
   CONSUME. So a layer that wants to let go — the root's "press back again" —
   simply does not re-arm, and `armed: false` is the whole mechanism: the next
   press finds no sentinel, is not consumed, and leaves for real.

   CHROMIUM SKIPS ENTRIES PUSHED WITHOUT A GESTURE. The history-manipulation
   intervention marks the entry a page was on when it pushed a new one with no
   user activation behind it, and the back button skips marked entries. That
   is fine for a dialog (it opens on a tap) and fatal for the app's root: the
   root re-arms after a BACK press (returning home by back, or the hint's
   grace window running out), and a back press is not a user activation. The
   root's freshly pushed sentinel then marks home as skippable, and the next
   press jumps straight past the hint and closes the app — "press back again
   to exit" showing only sometimes. Two answers, used together:

     1. THE BASE (the root's exit guard, or "back goes home" on a page with
        nothing behind it) is a CloseWatcher where the browser has one
        (Chromium 120+, i.e. every Android Chrome / installed app). A close
        watcher takes the back press BEFORE history does and costs no history
        entry, so it can be re-armed at any time, gesture or not. It is only
        alive while nothing else is: any layer above it, or a foreign overlay
        holding the base (holdBase), takes it down, because a close watcher
        would otherwise get the press ahead of their history entries.
     2. A sentinel that has outlived its layer (left behind under the next
        page by a navigation) is ADOPTED by the next layer that arms on it,
        not stacked on with another push.

   Gesture listeners below still re-arm on the first touch, for sentinels
   pushed before any gesture (a cold start, browsers with no CloseWatcher):
   Chromium clears the skip mark on an entry once its document gets a gesture.
   Do not remove them because they look redundant.

   FOLDING HISTORY AT THE ROOT (collapseHistory). The second press only closes
   the app when it is made on the FIRST history entry. By then there are
   usually entries behind home — /login, the pages visited, a stale sentinel —
   and the "exit" press walks back into those instead. Where the Navigation
   API can see them, the root folds them away when the hint goes up: one
   silent traversal back to the first entry of this document, which is then
   rewritten to be home. Nothing re-renders; the press after it leaves. */

/** One key for every layer. The id in the value is who owns the entry. */
const LAYER_FLAG = '__elbritBackLayer';

let layers = [];
let base = null;
let holds = 0;
let fallback = null;
let collapsing = null;
/* Sentinels on their way out (releaseLayer's own back()): dead, but not
   adoptable — the pop already in flight would take the adopter's entry. */
const leaving = new Set();
/* Pops we started ourselves (releaseLayer) and still expect to hear. */
let ownPops = [];
/* Entries of layers released while a live layer's entry sat above them
   (stacked overlays closing together, bottom first). The layer above takes
   them off with its own when it releases. */
let buried = [];
let listening = false;
let nextId = 1;

const isBrowser = () => typeof window !== 'undefined';

const hasCloseWatcher = () => isBrowser() && typeof window.CloseWatcher === 'function';

const topLayer = () => layers[layers.length - 1] ?? null;

const isLive = (id) => layers.some((layer) => layer.id === id);

/** Pushes the top layer's sentinel, unless it is already the current entry. */
function armTop() {
  if (!isBrowser()) return;
  const top = topLayer();
  if (!top || !top.wantsArm) return;
  const current = window.history.state?.[LAYER_FLAG];
  if (current === top.id) {
    top.armed = true;
    return;
  }
  /* A sentinel whose layer is gone (a dialog or the root that was up when the
     app navigated away, now back under the page we returned to) already sits
     where this one would go. Taking it over costs no new entry — and a new
     entry pushed here, after a back press, would be pushed without a gesture
     and make Chromium skip the page beneath it. */
  if (current && !isLive(current) && !leaving.has(current)) {
    window.history.replaceState({ ...window.history.state, [LAYER_FLAG]: top.id }, '');
    top.armed = true;
    return;
  }
  window.history.pushState({ ...window.history.state, [LAYER_FLAG]: top.id }, '');
  top.armed = true;
}

/* The base's close watcher lives exactly while nothing else wants the press:
   no layer above it, no foreign overlay holding it, and the base itself armed. */
function syncBase() {
  if (!base || base.kind !== 'watcher') return;
  const wanted = base.wantsArm && layers.length === 0 && holds === 0;
  if (wanted && !base.watcher) {
    const owner = base;
    let watcher;
    try {
      watcher = new window.CloseWatcher();
    } catch {
      return; // the document is not fully active; the next sync tries again
    }
    watcher.onclose = () => {
      if (owner.watcher !== watcher) return;
      owner.watcher = null;
      owner.wantsArm = false;
      owner.onBack({ rearm: () => owner.handle.rearm(), release: () => owner.handle.release() });
    };
    owner.watcher = watcher;
    rememberEntry(owner);
  } else if (!wanted && base.watcher) {
    dropWatcher(base);
  }
}

/* The page the base guards, for when a press slips past its watcher into
   history and the entry it lands on has to be made this page again. */
function rememberEntry(owner) {
  if (!isBrowser()) return;
  const state = { ...(window.history.state ?? {}) };
  delete state[LAYER_FLAG];
  owner.entry = { state, url: window.location.href };
}

function dropWatcher(owner) {
  const watcher = owner.watcher;
  owner.watcher = null;
  if (!watcher) return;
  watcher.onclose = null;
  try {
    watcher.destroy();
  } catch {
    /* already gone */
  }
}

/* Decides one popstate. `consume()` is how a branch says the router must not
   act on it. Returns nothing; the caller reads what `consume` was told. */
function runPop(consume) {
  /* Our own pop (releaseLayer taking a dialog's sentinel off): already
     accounted for, so nobody may act on it. */
  if (ownPops.length) {
    ownPops.shift();
    consume();
    return;
  }

  /* Our own fold back to the first entry (collapseHistory): the page on screen
     is already the right one, so the router must not hear it, and the entry we
     landed on is rewritten to be the one we left. */
  if (collapsing) {
    const fold = collapsing;
    collapsing = null;
    consume();
    window.history.replaceState(fold.state, '', fold.url);
    return;
  }

  const top = topLayer();

  /* Our own sentinel is STILL the current entry, so whatever was popped sat
     above it — a history entry pushed by something that is not on this stack
     (the calendar's overlay hook, Secondary Entry's unsaved guard, both of
     which keep their own). That press belongs to them; leaving the event
     alone is what lets their handler take it. */
  if (top && top.armed && isBrowser() && window.history.state?.[LAYER_FLAG] === top.id) {
    return;
  }

  /* A disarmed top layer is a layer that has chosen to let this press
     through — the root's grace window. Nothing is consumed, so the browser
     performs the real back and an installed app closes. */
  if (top && top.armed) {
    consume();
    top.armed = false;
    top.onBack({ rearm: armTop, release: () => releaseLayer(top.id) });
    return;
  }

  /* The base's close watcher was armed and the press went to history anyway.
     Chrome does this — seen on a handset (16 Oct 2026) for the first press
     after the app came back from Google's sign-in tab: the watcher sat there,
     the press walked back onto the login entry. Do what the watcher would
     have: keep the router off it, put the page we were on back onto the entry
     the press landed on, and hand the press to the base. */
  if (base?.kind === 'watcher' && base.watcher && layers.length === 0 && holds === 0) {
    const owner = base;
    consume();
    if (owner.entry) window.history.replaceState(owner.entry.state, '', owner.entry.url);
    dropWatcher(owner);
    owner.wantsArm = false;
    owner.onBack({ rearm: () => owner.handle.rearm(), release: () => owner.handle.release() });
    return;
  }

  /* Nobody is holding a layer: the app-level rules get a look (the other app
     uses this to refuse a back press INTO the login page while signed in). */
  fallback?.({ stopImmediatePropagation: consume });
}

/* The decision for the popstate being dispatched right now, keyed by the event
   itself, so the stack's listener and a router's hook (claimPop) — whichever
   hears it first — decide it once and both apply the same answer. */
let decided = null;

/** The popstate being dispatched, where the browser still exposes it. */
const currentEvent = () => (isBrowser() ? window.event ?? null : null);

function decide(event) {
  if (event && decided?.event === event) return decided.consumed;
  let consumed = false;
  runPop(() => {
    consumed = true;
  });
  decided = { event, consumed };
  return consumed;
}

function onPopState(event) {
  if (decide(event)) event.stopImmediatePropagation();
}

/**
 * For a router that handles popstate BEFORE this stack's own listener: Next's
 * pages router does (its listener is registered first, and on Chrome it runs
 * first), so stopping the event in ours came too late — Next had already
 * routed to the entry the press landed on (the login page, mid-fold). Call it
 * from the router's pre-pop hook and skip the route when it returns true:
 *
 *   router.beforePopState(() => !claimPop())
 *
 * Decides the pop once; the window listener then only applies the answer.
 */
export function claimPop() {
  if (!isBrowser()) return false;
  const event = currentEvent();
  /* Without the event to key on, this cannot tell a second hearing of the
     same press from a new one; the stack's own listener then decides alone. */
  if (!event || event.type !== 'popstate') return false;
  return decide(event);
}

/* Every gesture is a chance to clear Chromium's skip flag off an already
   pushed sentinel, and a cheap no-op once the entry is current. Capture +
   passive so nothing in the app can swallow it or be slowed by it, and
   `touchstart` so the touch that merely BEGINS a scroll counts. */
const GESTURES = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'];
const GESTURE_OPTS = { capture: true, passive: true };

function onGesture() {
  armTop();
}

function startListening() {
  if (listening || !isBrowser()) return;
  window.addEventListener('popstate', onPopState, true);
  GESTURES.forEach((name) => window.addEventListener(name, onGesture, GESTURE_OPTS));
  listening = true;
}

function stopListening() {
  if (!listening || !isBrowser()) return;
  window.removeEventListener('popstate', onPopState, true);
  GESTURES.forEach((name) => window.removeEventListener(name, onGesture, GESTURE_OPTS));
  listening = false;
}

function maybeStopListening() {
  /* Not while one of our own pops or a fold is still on its way: nobody else
     would keep the router off it. */
  if (layers.length === 0 && !fallback && !base && !ownPops.length && !collapsing) stopListening();
}

/**
 * Adds a layer on top and arms it.
 *
 * `onBack({ rearm, release })` is called when the press reaches this layer.
 * The layer has already been disarmed by then and decides what happens next:
 * `rearm()` to keep holding the gesture (another sub-layer closed, or the
 * root's grace window expiring), `release()` to drop out of the stack, or
 * neither — which leaves the next press unconsumed.
 */
export function pushLayer({ onBack, name = 'layer' }) {
  const layer = { id: `${name}-${nextId++}`, onBack, armed: false, wantsArm: true };
  layers.push(layer);
  startListening();
  syncBase();
  armTop();
  return handleFor(layer);
}

function handleFor(layer) {
  return {
    id: layer.id,
    rearm: () => {
      layer.wantsArm = true;
      if (topLayer() === layer) armTop();
    },
    disarm: () => {
      layer.wantsArm = false;
      layer.armed = false;
    },
    release: () => releaseLayer(layer.id),
  };
}

/**
 * The bottom of the stack: the press nothing above has claimed. One at a time
 * — a new base replaces the old. The app root's exit guard is one; so is "back
 * goes home" on a page with nothing behind it.
 *
 * Same contract as pushLayer, and the same handle. Where the browser has a
 * CloseWatcher it is one (see the top of this file for why); elsewhere it is
 * an ordinary layer, slid in UNDER whatever is already on the stack.
 */
export function pushBase({ onBack, name = 'base' }) {
  if (base) base.handle.release();
  startListening();

  if (!hasCloseWatcher()) {
    const layer = { id: `${name}-${nextId++}`, onBack, armed: false, wantsArm: true };
    layers.unshift(layer);
    armTop();
    const handle = handleFor(layer);
    const owner = { kind: 'layer', handle };
    base = owner;
    handle.release = () => {
      if (base === owner) base = null;
      releaseLayer(layer.id);
    };
    return handle;
  }

  const owner = { kind: 'watcher', id: `${name}-${nextId++}`, onBack, wantsArm: true, watcher: null };
  owner.handle = {
    id: owner.id,
    rearm: () => {
      if (base !== owner) return;
      owner.wantsArm = true;
      syncBase();
    },
    disarm: () => {
      owner.wantsArm = false;
      if (base === owner) syncBase();
    },
    release: () => {
      if (base !== owner) return;
      dropWatcher(owner);
      base = null;
      maybeStopListening();
    },
  };
  base = owner;
  syncBase();
  return owner.handle;
}

/**
 * For overlays that keep their own history entry instead of a layer (the
 * calendar's dialogs, Secondary Entry's unsaved guard): while held, the base
 * stands down, so the press reaches their entry rather than a close watcher
 * that would otherwise get it first. Returns the release.
 */
export function holdBase() {
  holds += 1;
  syncBase();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    syncBase();
  };
}

/**
 * Drops a layer and, if its sentinel is still the current entry, takes that
 * entry back off — closing a dialog through its own X has to cost the history
 * what the dialog cost it, or the next back press is spent on a layer that is
 * already gone.
 */
export function releaseLayer(id) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return;
  const layer = layers[index];
  const wasTop = index === layers.length - 1;
  layers.splice(index, 1);

  const current = isBrowser() ? window.history.state?.[LAYER_FLAG] : undefined;
  if (current === id) {
    popOwnEntry(id);
    /* Layers released from UNDER this one a moment ago left their entries
       directly beneath it; they come off with it. */
    while (buried.length) popOwnEntry(buried.pop());
  } else if (layer.armed && current && leaving.has(current)) {
    /* STACKED LAYERS CLOSING TOGETHER, top first: a sheet and the popover on
       it, both unmounted in one commit. The popover's entry is already on its
       way out (its back() is in flight, so the state has not moved yet), and
       this layer's entry is the one right under it — take that too, or the
       next real press is spent popping an entry nobody owns. */
    popOwnEntry(id);
  } else if (layer.armed && !wasTop && isBrowser()) {
    /* The same, bottom first: the entry above is still a live layer's, so
       this one cannot come off yet. The top layer takes it with its own. */
    buried.push(id);
  }

  syncBase();
  maybeStopListening();
}

/* Our own pop, so it must not reach the stack or the router (runPop consumes
   it, through claimPop too). It accounts for exactly ONE event: a swallow that
   stays up for a fixed window also eats whatever back press happens to land
   inside it, which is a real press by a real person. The timeout is only the
   escape hatch for when `back()` has nothing to pop and no event ever
   arrives. Two in one task are two traversals, two events, two tokens. */
function popOwnEntry(id) {
  leaving.add(id);
  const token = { id };
  ownPops.push(token);
  startListening();
  window.history.back();
  window.setTimeout(() => {
    leaving.delete(id);
    const at = ownPops.indexOf(token);
    if (at !== -1) ownPops.splice(at, 1);
  }, 500);
}

/**
 * The handler for presses no layer claimed. One at a time — this is an
 * app-level rule (ours: never go back INTO the login page), not a feature.
 */
export function setFallback(handler) {
  fallback = handler;
  if (handler) startListening();
  else maybeStopListening();
  return () => {
    if (fallback === handler) fallback = null;
    maybeStopListening();
  };
}

/**
 * Folds the history behind the current page away, so the next back press is
 * made on the first entry and closes the app. Silent: one traversal back to
 * the first entry of THIS document (an older document would load, not fold),
 * whose state and URL are then rewritten to the current page's. Needs the
 * Navigation API to see where it is; without it, does nothing.
 *
 * Returns whether a fold was started.
 */
export function collapseHistory() {
  if (!isBrowser()) return false;
  const nav = window.navigation;
  const current = nav?.currentEntry;
  if (!current || typeof current.index !== 'number' || current.index <= 0) return false;
  const entries = typeof nav.entries === 'function' ? nav.entries() : [];
  let start = current.index;
  while (start > 0 && entries[start - 1]?.sameDocument) start -= 1;
  if (start === current.index) return false;

  const state = { ...(window.history.state ?? {}) };
  delete state[LAYER_FLAG];
  collapsing = { state, url: window.location.href };
  startListening();
  window.history.go(start - current.index);
  /* Escape hatch: a traversal that never fires must not leave the next real
     press mistaken for our own. */
  const fold = collapsing;
  window.setTimeout(() => {
    if (collapsing === fold) collapsing = null;
  }, 1000);
  return true;
}

/**
 * Whether a back press here would leave the app or land somewhere it must
 * not: this is the first entry, or the one before it is on `blockedPaths`
 * (the login page). Undefined where the Navigation API is missing — then
 * nobody can tell, and the caller should leave back alone.
 */
export function backLeavesApp(blockedPaths = []) {
  if (!isBrowser()) return undefined;
  const nav = window.navigation;
  const current = nav?.currentEntry;
  if (!current || typeof current.index !== 'number') return undefined;
  if (current.index === 0) return true;
  const entries = typeof nav.entries === 'function' ? nav.entries() : [];
  const before = entries[current.index - 1];
  if (!before?.url) return false;
  let path;
  try {
    path = new URL(before.url).pathname;
  } catch {
    return false;
  }
  return blockedPaths.some((blocked) => isUnderPath(path, blocked));
}

/** `path` is `base` or a page below it: the login page is "/login" and every
    "/login/<id>/<name>/<reason>" variant of it. */
export function isUnderPath(path, base) {
  const p = normalisePath(path);
  const b = normalisePath(base);
  if (b === '/') return p === '/';
  return p === b || p.startsWith(`${b}/`);
}

/**
 * Whether entries of an OLDER document sit behind this one's — a full page
 * load happened earlier in this session (a sign-in redirect, a reload). Those
 * cannot be folded away: a back press into one loads it, so the app's first
 * entry is out of reach and "press back again" lands there instead of leaving.
 * False where the Navigation API cannot say.
 */
export function olderDocumentBehind() {
  if (!isBrowser()) return false;
  const nav = window.navigation;
  const current = nav?.currentEntry;
  if (!current || typeof current.index !== 'number' || current.index <= 0) return false;
  const entries = typeof nav.entries === 'function' ? nav.entries() : [];
  let start = current.index;
  while (start > 0 && entries[start - 1]?.sameDocument) start -= 1;
  return start > 0;
}

/** Trailing slash, query and hash are not part of "which route is this". */
export function normalisePath(pathname) {
  if (!pathname) return '/';
  const path = String(pathname).split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

/** Re-arms whatever holds the press at the bottom or the top. Call after a
    navigation: landing back on a guarded route has to leave the guard up. */
export function rearmTop() {
  armTop();
  syncBase();
  if (base?.kind === 'watcher' && base.watcher) rememberEntry(base);
}

/** Test seam. Nothing in the app calls this. */
export function __resetBackStack() {
  if (base?.kind === 'watcher') dropWatcher(base);
  layers = [];
  base = null;
  holds = 0;
  fallback = null;
  collapsing = null;
  leaving.clear();
  ownPops = [];
  buried = [];
  decided = null;
  nextId = 1;
  stopListening();
}

export const BACK_LAYER_FLAG = LAYER_FLAG;
