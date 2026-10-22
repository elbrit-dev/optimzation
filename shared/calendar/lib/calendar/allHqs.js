import { useEffect, useState } from "react";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

/**
 * Every HQ, for every user — the `elbrit_all_hqs` server script
 * (erp/server-scripts/all_hqs.py). Other Work can be done at any HQ, so its
 * picker can't use the Territory list, which ERP narrows to the user's own
 * HQ(s) through their User Permissions; the script reads Territory without
 * that restriction.
 *
 * HQs rarely change, so one successful read lasts the page load. A failed or
 * empty read is not kept: the next form open asks again.
 */
let hqs = [];
let inFlight = null;

export function loadAllHqs() {
  if (hqs.length) return Promise.resolve(hqs);
  if (inFlight) return inFlight;

  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) return Promise.resolve(hqs);
  const base = erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");

  inFlight = fetch(`${base}/api/method/elbrit_all_hqs`, {
    headers: { Authorization: `token ${authToken}` },
  })
    .then(async (response) => {
      const json = await response.json().catch(() => null);
      const list = json?.message?.hqs;
      if (response.ok && Array.isArray(list)) {
        hqs = list.filter(Boolean).map((name) => ({ value: name, label: name }));
      }
      return hqs;
    })
    .catch(() => hqs)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** All HQs as { value, label } options, read when `active` turns true. */
export function useAllHqs(active) {
  const [options, setOptions] = useState(hqs);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    loadAllHqs().then((list) => {
      if (live) setOptions(list);
    });
    return () => {
      live = false;
    };
  }, [active]);
  return options;
}
