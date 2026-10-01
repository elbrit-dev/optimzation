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

   CHROMIUM SKIPS SENTINELS PUSHED WITHOUT A GESTURE. The history-manipulation
   intervention flags every same-document entry of a document that pushed one
   with no user activation behind it, and back skips the lot — which on a cold
   start meant the app closed with an unused sentinel sitting there. The flag
   is cleared for those entries the moment the document gets ANY gesture, so
   the fix is to arm early and re-arm on the first touch, which is what the
   gesture listeners below do. Do not remove them because they look redundant;
   they are the difference between this working on a cold start and not. */

/** One key for every layer. The id in the value is who owns the entry. */
const LAYER_FLAG = '__elbritBackLayer';

let layers = [];
let fallback = null;
let listening = false;
let nextId = 1;

const isBrowser = () => typeof window !== 'undefined';

const topLayer = () => layers[layers.length - 1] ?? null;

/** Pushes the top layer's sentinel, unless it is already the current entry. */
function armTop() {
  if (!isBrowser()) return;
  const top = topLayer();
  if (!top || !top.wantsArm) return;
  if (window.history.state?.[LAYER_FLAG] === top.id) {
    top.armed = true;
    return;
  }
  window.history.pushState({ ...window.history.state, [LAYER_FLAG]: top.id }, '');
  top.armed = true;
}

function onPopState(event) {
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
    event.stopImmediatePropagation();
    top.armed = false;
    top.onBack({ rearm: armTop, release: () => releaseLayer(top.id) });
    return;
  }

  /* Nobody is holding a layer: the app-level rules get a look (the other app
     uses this to refuse a back press INTO the login page while signed in). */
  fallback?.(event);
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

/**
 * Adds a layer on top and arms it.
 *
 * `onBack({ rearm, release })` is called when the press reaches this layer.
 * The layer has already been disarmed by then and decides what happens next:
 * `rearm()` to keep holding the gesture (another sub-layer closed, or the
 * root's grace window expiring), `release()` to drop out of the stack, or
 * neither — which leaves the next press unconsumed.
 *
 * `wantsArm: false` registers a layer that never holds a sentinel, used by the
 * root guard while it is deliberately letting go.
 */
export function pushLayer({ onBack, name = 'layer' }) {
  const layer = { id: `${name}-${nextId++}`, onBack, armed: false, wantsArm: true };
  layers.push(layer);
  startListening();
  armTop();
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
 * Drops a layer and, if its sentinel is still the current entry, takes that
 * entry back off — closing a dialog through its own X has to cost the history
 * what the dialog cost it, or the next back press is spent on a layer that is
 * already gone.
 */
export function releaseLayer(id) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return;
  layers.splice(index, 1);

  if (isBrowser() && window.history.state?.[LAYER_FLAG] === id) {
    /* Our own pop, so it must not reach the stack or the router. It swallows
       exactly ONE event and unsubscribes there: a listener that stays up for
       a fixed window also eats whatever back press happens to land inside it,
       which is a real press by a real person. The timeout is only the escape
       hatch for when `back()` has nothing to pop and no event ever arrives. */
    const swallow = (event) => {
      event.stopImmediatePropagation();
      window.removeEventListener('popstate', swallow, true);
    };
    window.addEventListener('popstate', swallow, true);
    window.history.back();
    window.setTimeout(() => window.removeEventListener('popstate', swallow, true), 500);
  }

  if (layers.length === 0 && !fallback) stopListening();
}

/**
 * The handler for presses no layer claimed. One at a time — this is an
 * app-level rule (ours: never go back INTO the login page), not a feature.
 */
export function setFallback(handler) {
  fallback = handler;
  if (handler) startListening();
  else if (layers.length === 0) stopListening();
  return () => {
    if (fallback === handler) fallback = null;
    if (layers.length === 0 && !fallback) stopListening();
  };
}

/** Re-arms the top layer. Call after a navigation: landing back on a guarded
    route has to leave the guard up. */
export { armTop as rearmTop };

/** Test seam. Nothing in the app calls this. */
export function __resetBackStack() {
  layers = [];
  fallback = null;
  nextId = 1;
  stopListening();
}

export const BACK_LAYER_FLAG = LAYER_FLAG;
