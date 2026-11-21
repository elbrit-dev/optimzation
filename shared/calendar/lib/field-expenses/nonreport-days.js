/* Non-reported days (19 Nov 2026; manager approval 21 Nov 2026). A working day
   the Field Expense build paid nothing on -- NON-Reported (no visit, no other
   work), or only a meeting with no HQ -- the rep says what they did (doctor
   visits, many doctors at once at an HQ; meetings; other work; the HQ for the
   HQ-less meeting -- any mix). It goes to their manager (the direct parent seat,
   a vacant seat passing it up; the next person up after 2 days). On Approve the
   ERP makes the events in the rep's name and the engine service re-runs the
   month; on Reject the rep sees why and may send again.
   ERP side: Server Script "Field Non-Reported Day API" (method
   field_nonreport_day, share/src/app/field-expense/server/field_nonreport_day_api.py),
   called with the rep's own token. */
import { useEffect, useSyncExternalStore } from "react";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

const erpOrigin = () => {
  try {
    return new URL(AUTH_CONFIG.erpUrl).origin;
  } catch {
    return "";
  }
};
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(String(t || "")) ? t : `token ${t}`);

async function call(params) {
  let res;
  try {
    res = await fetch(`${erpOrigin()}/api/method/field_nonreport_day`, {
      method: "POST",
      headers: { Authorization: tokenHeader(AUTH_CONFIG.authToken), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params),
    });
  } catch {
    throw new Error("Couldn't reach the ERP — check the connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json.message || {};
  let msg = null;
  try {
    msg = JSON.parse(JSON.parse(json._server_messages)[0]).message;
  } catch {
    /* none */
  }
  throw new Error(msg ? String(msg).replace(/<[^>]*>/g, "") : `It could not be sent (HTTP ${res.status}).`);
}

const monthEnd = (ym) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);
  return `${ym}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------- a tiny store: the month's Tasks, shared by the card and the sheet ---------- */

const state = new Map(); // month -> { status: "loading" | "ready" | "error", tasks, error, at }
// read again when older than this: a day the team marks done leaves the card
// the next time the strip or the sheet opens, no reload needed
const STALE_MS = 60 * 1000;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const EMPTY = { status: "idle", tasks: [], error: null };

export function loadNonReport(month, force = false) {
  const cur = state.get(month);
  if (!force && cur && (cur.status === "loading" || (cur.status === "ready" && Date.now() - (cur.at || 0) < STALE_MS))) return;
  state.set(month, { status: "loading", tasks: cur?.tasks || [], error: null });
  emit();
  call({ action: "list", from: `${month}-01`, to: monthEnd(month) })
    .then((r) => state.set(month, { status: "ready", tasks: r.tasks || [], error: null, at: Date.now() }))
    .catch((error) => state.set(month, { status: "error", tasks: cur?.tasks || [], error }))
    .finally(emit);
}

/* -> { status, tasks, error } for the month, loading it the first time */
export function useNonReportTasks(month, enabled = true) {
  useEffect(() => {
    if (enabled && month) loadNonReport(month);
  }, [month, enabled]);
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state.get(month) || EMPTY,
    () => EMPTY
  );
}

/* the rep's meetings with no HQ on a day -> [{ name, type, subject }] */
export async function fetchHqless(date) {
  const r = await call({ action: "hqless", date });
  return r.events || [];
}

/* who approves the rep's requests -> { approver_names, escalation_names } (once per session) */
let routeP = null;
export function fetchRoute() {
  if (!routeP) routeP = call({ action: "route" }).catch((e) => ((routeP = null), Promise.reject(e)));
  return routeP;
}

/* entries: [{ type: "doctor_visit", hq, doctors: [id], note }
            | { type: "meeting", hq, title, note }
            | { type: "other", other_type, hq, title, note }
            | { type: "meeting_hq", event, hq }]
   -> the new Task (also put into the month's list) */
export async function sendNonReport({ month, date, entries }) {
  const r = await call({ action: "raise", date, entries: JSON.stringify(entries) });
  const task = r.task || null;
  if (task && month) {
    const cur = state.get(month) || EMPTY;
    state.set(month, { ...cur, status: "ready", tasks: [task, ...(cur.tasks || [])], at: cur.at || Date.now() });
    emit();
  }
  return task;
}

/* the day's status from its requests: none | open (waiting for the manager) |
   done (approved) | rejected (the latest was rejected -- it may be sent again) */
export const DONE = new Set(["Completed", "Cancelled"]);
export function dayState(tasks) {
  if (!tasks?.length) return "none";
  if (tasks.some((t) => !DONE.has(t.status))) return "open";
  if (tasks.some((t) => t.status === "Completed")) return "done";
  return "rejected";
}

export const OTHER_KINDS = ["Admin Day", "Chemist Day", "Conference"];
