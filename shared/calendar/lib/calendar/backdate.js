import { useEffect, useState } from "react";
import { format, startOfDay } from "date-fns";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

/**
 * Past days ERP has opened to DR visits for this user — the
 * `elbrit_backdate_windows` server script (erp/server-scripts/backdate_windows.py)
 * decides who gets which days, so opening or closing access needs no app change.
 * A visit marked on such a day skips the 500 m check (never a force visit);
 * ERP stamps its hidden backdate reason on save.
 *
 * Read fresh — no time cache — with the calendar's events and every time a
 * DR form or visit opens (useBackdateWindows), so a window enabled or closed
 * in ERP applies the next time the user opens one. A disabled script, a site
 * without it, or a failed read leaves no window open.
 */
let windows = [];
let inFlight = null;

export function loadBackdateWindows() {
  if (inFlight) return inFlight;

  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) return Promise.resolve(windows);
  const base = erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");

  inFlight = fetch(`${base}/api/method/elbrit_backdate_windows`, {
    headers: { Authorization: `token ${authToken}` },
  })
    .then(async (response) => {
      const json = await response.json().catch(() => null);
      const list = json?.message?.windows;
      windows = response.ok && Array.isArray(list) ? list : [];
      return windows;
    })
    .catch(() => windows)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Re-reads the windows whenever `active` turns true (a dialog opening) and
 * returns a counter that bumps when they arrive, to re-render and to re-run
 * effects that depend on isBackdateOpen.
 */
export function useBackdateWindows(active) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    loadBackdateWindows().then(() => {
      if (live) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [active]);
  return version;
}

/** True when `date` is a past day inside one of the user's open windows. */
export function isBackdateOpen(date, now = new Date()) {
  if (!date || windows.length === 0) return false;
  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return false;
  if (startOfDay(day) >= startOfDay(now)) return false;
  const key = format(day, "yyyy-MM-dd");
  return windows.some((w) => w.from <= key && key <= w.to);
}
