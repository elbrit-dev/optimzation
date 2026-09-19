/**
 * Closes the installed app.
 *
 * There is exactly one lever for this on the web, and it is narrow: Chromium
 * honours `window.close()` only when the window has an opener or when its
 * session history holds FEWER THAN TWO entries. We cannot give the window an
 * opener, so the whole job is getting the history down to one entry — and the
 * only thing that discards history entries is a navigation, which drops
 * everything forward of wherever it happens. Stand on entry 0, navigate with
 * replace, and the session history is exactly one entry long. Then close works.
 *
 * Getting to entry 0 is where the first attempt at this failed on a real
 * handset. It computed the distance as `history.length - 1` and jumped in one
 * `history.go()`, with a timeout as a safety net. Two ways that loses:
 *
 *   - If the current entry is not the last one, that delta is out of range,
 *     and an out-of-range traversal is a silent no-op. The timeout then fired
 *     and the replace ran from the ORIGINAL position, leaving the history as
 *     long as it started.
 *   - If the entry being traversed to belongs to a different DOCUMENT — the
 *     /login page load from before sign-in is one — the traversal unloads this
 *     document instead of firing popstate. The timeout fired first and
 *     cancelled the navigation that was already under way.
 *
 * So this walks back ONE entry at a time instead of guessing a distance:
 *
 *   - Each step is `history.go(-1)`, which is in range by definition until we
 *     reach entry 0.
 *   - popstate means we moved, so step again. Same-document pops arrive within
 *     a turn of the event loop, so a whole session's worth of entries unwinds
 *     in milliseconds.
 *   - pagehide means the step crossed into another document. That document
 *     picks the walk back up through `resumeExitIfPending`, and the pending
 *     timer is cancelled so it cannot cancel a navigation in flight.
 *   - Silence means `history.go(-1)` did nothing, which happens only at entry
 *     0. That is the finish line.
 *
 * The flag lives in sessionStorage precisely because a document change has to
 * survive it, and it is scoped to this tab, so it cannot leak into another.
 */

const FLAG = "__elbritExitInProgress";
const EXIT_URL = "/exit.html";

/* How long to wait for a step to report back before concluding there was
   nowhere left to go. Same-document popstate is immediate; this only has to
   out-wait the event loop, not the network. */
const SETTLE_MS = 400;

export function isExiting() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(FLAG) === "1";
  } catch (e) {
    return false;
  }
}

function setExiting(on) {
  try {
    if (on) window.sessionStorage.setItem(FLAG, "1");
    else window.sessionStorage.removeItem(FLAG);
  } catch (e) {
    /* private mode, blocked storage — the walk still works, it just cannot
       survive a document change. Better than refusing to try. */
  }
}

/** Entry 0, at last. Replace it and every forward entry goes with it. */
function land() {
  window.location.replace(EXIT_URL);
}

function walkBack() {
  let done = false;
  let timer = 0;

  const cleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener("popstate", onMoved, true);
    window.removeEventListener("pagehide", onLeaving, true);
  };

  // Swallowed in the capture phase so Next never routes to the pages we are
  // passing through. Nothing renders during the walk — no flicker, and no
  // chance of touching the login page on the way past it.
  const onMoved = (event) => {
    event.stopImmediatePropagation();
    if (done) return;
    done = true;
    cleanup();
    walkBack();
  };

  const onLeaving = () => {
    if (done) return;
    done = true;
    cleanup();
  };

  const onSettled = () => {
    if (done) return;
    done = true;
    cleanup();
    land();
  };

  window.addEventListener("popstate", onMoved, true);
  window.addEventListener("pagehide", onLeaving, true);
  timer = window.setTimeout(onSettled, SETTLE_MS);

  window.history.go(-1);
}

/** Called from the Exit button. */
export function exitApp() {
  if (typeof window === "undefined") return;

  // Already the only entry — nothing to unwind.
  if (window.history.length < 2) {
    window.close();
    return;
  }

  setExiting(true);
  walkBack();
}

/**
 * Picks the walk back up in a document the traversal landed on.
 *
 * Call it once on mount, from anywhere that runs on every page.
 */
export function resumeExitIfPending() {
  if (typeof window === "undefined") return;
  if (!isExiting()) return;
  if (window.location.pathname === EXIT_URL) return;
  walkBack();
}

/** For /exit.html, which is the end of the road either way. */
export function clearExitFlag() {
  setExiting(false);
}
