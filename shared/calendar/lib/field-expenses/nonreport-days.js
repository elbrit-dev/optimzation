/* Non-reported days (19 Nov 2026). A day the Field Expense build marked
   NON-Reported (no visit, no other work on record): the rep says what they
   did -- doctor visits (many doctors at once, at an HQ), meetings, other work,
   any mix -- and it becomes an ERP Task in the "Expense claim" project, like
   the TA/DA help requests. The team makes the real events from it (the Task
   carries them as event drafts) and rebuilds the day.
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

/* entries: [{ type: "doctor_visit", hq, doctors: [id], joint_with: [emp], note }
            | { type: "meeting", hq, title, from, to, location, attendees: [emp], note }
            | { type: "other", other_type, hq, title, note }]
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

/* the day's status from its Tasks: none | open | done */
export const DONE = new Set(["Completed", "Cancelled"]);
export function dayState(tasks) {
  if (!tasks?.length) return "none";
  if (tasks.some((t) => !DONE.has(t.status))) return "open";
  return tasks.some((t) => t.status === "Completed") ? "done" : "none";
}

export const OTHER_KINDS = ["Admin Day", "Chemist Day", "Conference"];
