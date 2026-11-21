"use client";

/* Non-reported days (19 Nov 2026): the working days the Field Expense build
   found nothing on record for. A card beside the HQ & EQ days / OS cards, and
   a sheet (the strip's own Modal, kind "nonreport"), one screen: the days as
   chips on top, the chosen day's form below (no pages, no back button), and
   the rep ticks what they did -- any mix of
     - doctor visits: an HQ, then many doctors at once (the DR Tour Plan's
       doctor picker, the doctors mapped to the rep's seats at that HQ)
     - a meeting: title and HQ
     - other work: Admin Day / Chemist Day / Conference, and its HQ
   (19 Nov 2026: no joint working, venue, time or attendees -- HQ always)
   -- sent as one request (lib/field-expenses/nonreport-days.js) to the rep's
   manager. On approval the ERP makes the events and the day is recalculated;
   a rejection says why and the day can be sent again (21 Nov 2026). A day
   whose only work is a meeting with no HQ is here too: the rep gives it its HQ. */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Briefcase, CalendarX2, Check, ChevronRight, Loader2, Palmtree, Stethoscope } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { ModalTitle } from "@calendar/components/ui/responsive-modal";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useFieldExpenses } from "@calendar/components/calendar/field/field-context";
import { RHFDoctorCardSelector } from "@calendar/components/RHFDoctorCardSelector";
import { fetchDoctorsByRoles } from "@calendar/components/calendar/module/event/services/master-data.service";
import { resolveLoggedInRoleId, resolveSeatHqs } from "@calendar/lib/employeeHeirachy";
import { dayLabel } from "@calendar/lib/field-expenses/field-days";
import { DONE, OTHER_KINDS, dayState, fetchHqless, fetchRoute, loadNonReport, sendNonReport, useNonReportTasks } from "@calendar/lib/field-expenses/nonreport-days";
import { HELP_STATUS, askedText, htmlText } from "@calendar/lib/field-expenses/trip-help";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => MONTH_LONG[Number(ym.slice(5, 7)) - 1];
const errText = (e) => e?.message || String(e);
const hqName = (hq) => String(hq || "").replace(/^HQ[-\s]*/i, "");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

const TONE = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-800",
  green: "bg-green-50 text-green-700",
  gray: "bg-gray-100 text-gray-600",
  rose: "bg-rose-100 text-rose-700",
};
const Pill = ({ tone, children, className }) => (
  <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", TONE[tone] || TONE.gray, className)}>{children}</span>
);
const when = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

/* the day's Tasks, by date */
const byDate = (tasks) => {
  const m = new Map();
  for (const t of tasks || []) m.set(t.date, [...(m.get(t.date) || []), t]);
  return m;
};
/* the days still to show: a day whose request the manager approved is
   gone at once (19 Nov 2026), without waiting for the month's rebuild */
const openDays = (days, map) => (days || []).filter((d) => dayState(map.get(d.date)) !== "done");

/* what the day shows: not added yet / sent (the latest open Task's state) / done */
function dayPill(list) {
  const st = dayState(list);
  if (st === "none") return { tone: "rose", label: "Not added" };
  if (st === "done") return { tone: "green", label: "Approved" };
  if (st === "rejected") return { tone: "rose", label: "Rejected" };
  return { tone: "amber", label: "Waiting" };
}
const toAdd = (st) => st === "none" || st === "rejected";

/* ---------- the card in the strip ---------- */

export function NonReportCard() {
  const f = useFieldExpenses();
  const all = f.nonReported || [];
  const { status, tasks } = useNonReportTasks(f.month, all.length > 0);
  const map = byDate(tasks);
  const days = openDays(all, map);
  if (!days.length) return null;
  const left = days.filter((d) => toAdd(dayState(map.get(d.date)))).length;
  const sent = days.length - left;
  return (
    <button
      type="button"
      onClick={() => f.openNonReport()}
      className={cn(
        "flex w-52 shrink-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-l-[3px] bg-white px-2.5 py-2 text-left shadow-sm active:opacity-80",
        left ? "border-l-amber-500" : "border-l-gray-300"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">Non-reported days</b>
        {status === "loading" && !tasks.length ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-hidden />
        ) : left ? (
          <Pill tone="amber" className="px-1.5 text-[9.5px]">{left} to add</Pill>
        ) : (
          <Pill tone="green" className="px-1.5 text-[9.5px]">All sent</Pill>
        )}
      </span>
      <span className="block truncate text-[11px] text-gray-500">
        {plural(days.length, "day")} with nothing paid on record
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1 border-t border-dashed pt-1 text-[11.5px] font-bold text-amber-700">
        <span className="min-w-0 flex-1 truncate">{left ? "Add doctor visits / meetings" : `${sent} with your manager`}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </span>
    </button>
  );
}

/* ---------- the sheet ---------- */

export function NonReportSheet() {
  const f = useFieldExpenses();
  const nr = useNonReportTasks(f.month, true);
  const map = useMemo(() => byDate(nr.tasks), [nr.tasks]);
  const days = openDays(f.nonReported, map);
  const isLeft = (d) => toAdd(dayState(map.get(d)));
  // the day on screen: the one asked for, else the first still to add (and
  // never one that has just been marked done)
  const [picked, setDate] = useState(() => f.sheet?.date || null);
  const date = days.some((d) => d.date === picked) ? picked : (days.find((d) => isLeft(d.date)) || days[0])?.date || null;
  // what the rep has typed, per day -- moving to another day keeps it
  const [drafts, setDrafts] = useState({});
  const draft = (date && drafts[date]) || EMPTY_DRAFT;
  const setDraft = (p) => setDrafts((all) => ({ ...all, [date]: { ...(all[date] || EMPTY_DRAFT), ...p } }));
  const left = days.filter((d) => isLeft(d.date)).length;

  // sent: clear the day and go on to the next one still to add
  const sent = () => {
    setDrafts((all) => ({ ...all, [date]: undefined }));
    const next = days.find((d) => d.date > date && isLeft(d.date)) || days.find((d) => d.date !== date && isLeft(d.date));
    if (next) setDate(next.date);
  };

  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:shrink-0">
        <div className="pr-10">
          <ModalTitle className="text-[22px] font-extrabold leading-tight tracking-tight text-gray-900">Non-reported days</ModalTitle>
          <p className="mt-0.5 text-[13.5px] font-semibold text-gray-500">
            {monthName(f.month)} · approved by your manager · {left ? `${left} of ${days.length} to add` : "all sent"}
          </p>
        </div>
        {nr.status === "error" && (
          <button type="button" onClick={() => loadNonReport(f.month, true)} className="rounded-xl bg-rose-50 px-3 py-2 text-left text-[12px] font-semibold text-rose-700">
            Couldn&apos;t load what you sent: {errText(nr.error)} — tap to try again
          </button>
        )}
        {days.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-500">Nothing left here — every day is sorted.</p>
        ) : (
          <>
            {/* the days, as chips: tap one to fill it in -- no pages, no back */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Days">
              {days.map((r) => {
                const st = dayState(map.get(r.date));
                const d = new Date(`${r.date}T00:00:00`);
                const on = r.date === date;
                const typed = !!drafts[r.date] && KINDS.some((k) => drafts[r.date][k.type]);
                return (
                  <button
                    key={r.date}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setDate(r.date)}
                    className={cn(
                      "relative flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5 leading-none",
                      on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-900 active:bg-gray-50"
                    )}
                  >
                    <small className={cn("text-[9.5px] font-bold uppercase", on ? "text-blue-100" : "text-gray-500")}>{d.toLocaleDateString("en-IN", { weekday: "short" })}</small>
                    <b className="mt-0.5 text-[16px] font-extrabold">{d.getDate()}</b>
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 rounded-full",
                        st === "done" ? "bg-green-500" : st === "open" ? "bg-amber-400" : typed ? "bg-blue-300" : "bg-rose-400"
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <p className="-mt-1 flex flex-wrap gap-x-3 text-[11px] font-semibold text-gray-500">
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-rose-400" /> to add</span>
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" /> with your manager</span>
            </p>
            {date && <DayBody key={date} date={date} tasks={map.get(date) || []} draft={draft} setDraft={setDraft} />}
          </>
        )}
      </div>
      {date && days.length > 0 && <SendBar date={date} tasks={map.get(date) || []} draft={draft} onSent={sent} />}
    </div>
  );
}

/* "12 doctors + 1 meeting", out of the Task's subject */
function taskSummary(t) {
  const m = /·\s*\d+\s\w+\s\d{4}\s·\s(.*?)\s—/.exec(t.subject || "");
  return m ? m[1] : "Sent";
}

/* ---------- the seats' HQs and their doctors ---------- */

const doctorCache = new Map(); // "hq|roles" -> promise

function useSeatHqs() {
  const { users, elbritRoleEdges, teamDataReady, ensureTeamData } = useCalendar();
  const f = useFieldExpenses();
  useEffect(() => {
    if (!teamDataReady) ensureTeamData?.().catch?.(() => {});
  }, [teamDataReady, ensureTeamData]);
  return useMemo(() => {
    const seats = resolveSeatHqs(elbritRoleEdges || [], resolveLoggedInRoleId(users || []));
    const hqs = [...new Set(seats.values())].sort();
    const own = f.data?.employee?.hq || null;
    if (own && !hqs.includes(own)) hqs.unshift(own);
    const rolesAt = (hq) => {
      const out = [];
      seats.forEach((h, role) => h === hq && out.push(role));
      // the rep's own seat when the team data has no edge for it
      if (!out.length && hq === own && f.data?.employee?.seat) out.push(f.data.employee.seat);
      return out.sort();
    };
    return { hqs, own: own || hqs[0] || "", rolesAt, ready: !!teamDataReady };
  }, [users, elbritRoleEdges, teamDataReady, f.data]);
}

function useHqDoctors(hq, rolesAt) {
  const roles = hq ? rolesAt(hq) : [];
  const key = `${hq}|${roles.join(",")}`;
  const [state, setState] = useState({ key: null, list: [], loading: false });
  useEffect(() => {
    if (!hq || !roles.length) {
      setState({ key, list: [], loading: false });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ key, list: s.key === key ? s.list : [], loading: true }));
    if (!doctorCache.has(key)) doctorCache.set(key, fetchDoctorsByRoles(roles, hq).catch((e) => (doctorCache.delete(key), Promise.reject(e))));
    doctorCache
      .get(key)
      .then((list) => alive && setState({ key, list, loading: false }))
      .catch(() => alive && setState({ key, list: [], loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state : { list: [], loading: true };
}

/* ---------- one day: what was done ---------- */

/* a day's draft: each kind on (its fields) or off (null) -- any mix */
const EMPTY_DRAFT = { doctor_visit: null, other: null, leave: null, meeting_hq: null };
const blank = (type, hq) =>
  type === "doctor_visit"
    ? { hq, doctors: [], note: "" }
    : type === "leave"
      ? { note: "" }
      : { other_type: "", hq, title: "", note: "" };

function entryError(type, e) {
  if (type === "meeting_hq") return e.hq ? null : "Meeting: pick its HQ";
  if (type === "doctor_visit") {
    if (!e.hq) return "Doctor visits: pick the HQ";
    if (!e.doctors.length) return "Doctor visits: pick the doctors";
  } else if (type === "leave") {
    return null;
  } else {
    if (!e.other_type) return "Meeting / other work: pick what it was";
    if (e.other_type === "Meeting" && e.title.trim().length < 3) return "Meeting: give it a title";
    if (e.other_type === "Conference" && e.title.trim().length < 3) return "Conference: name it";
    if (!e.hq) return `${e.other_type}: pick the HQ`;
  }
  return null;
}
const picked = (draft) =>
  KINDS.filter((k) => draft[k.type])
    .map((k) => ({ type: k.type, ...draft[k.type] }))
    // the HQ given to each HQ-less meeting (21 Nov 2026)
    .concat(Object.entries(draft.meeting_hq || {}).filter(([, hq]) => hq).map(([event, hq]) => ({ type: "meeting_hq", event, hq })));

const KINDS = [
  { type: "doctor_visit", label: "Doctor visits", hint: "Many doctors at once", Icon: Stethoscope, on: "border-blue-600 bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  // a meeting is one kind of other work (21 Nov 2026)
  { type: "other", label: "Meeting / other work", hint: "Meeting, admin, chemist, conference", Icon: Briefcase, on: "border-violet-600 bg-violet-50 text-violet-800", dot: "bg-violet-600" },
  // the whole day: nothing else goes with it (21 Nov 2026)
  { type: "leave", label: "Leave", hint: "On leave that day", Icon: Palmtree, on: "border-emerald-600 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
];

function DayBody({ date, tasks, draft, setDraft }) {
  const seat = useSeatHqs();
  const f = useFieldExpenses();
  const row = f.dayOf(date);
  const blocked = tasks.filter((t) => !DONE.has(t.status)).length >= 3;
  // the day's meetings with no HQ: each gets its HQ here (21 Nov 2026)
  const [hqless, setHqless] = useState(null);
  useEffect(() => {
    if (!row?.hqless) return undefined;
    let alive = true;
    fetchHqless(date)
      .then((ev) => alive && setHqless(ev))
      .catch(() => alive && setHqless([]));
    return () => {
      alive = false;
    };
  }, [date, row?.hqless]);
  const setMeetHq = (ev, hq) => setDraft({ meeting_hq: { ...(draft.meeting_hq || {}), [ev]: hq } });
  // leave is the whole day: ticking it clears the rest, ticking anything else clears leave (21 Nov 2026)
  const toggle = (type) => {
    if (draft[type]) return setDraft({ [type]: null });
    if (type === "leave") return setDraft({ doctor_visit: null, other: null, meeting_hq: null, leave: blank("leave") });
    return setDraft({ [type]: blank(type, seat.own), leave: null });
  };
  const patch = (type) => (p) => setDraft({ [type]: { ...draft[type], ...p } });

  return (
    <>
      {tasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <b className="text-[12.5px] font-bold text-gray-600">Sent for {dayLabel(date)}</b>
          {tasks.slice(0, 3).map((t) => (
            <SentTask key={t.name} t={t} />
          ))}
        </div>
      )}
      {blocked ? (
        <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-600">Three requests are already waiting for this day — wait for your manager to decide those.</p>
      ) : (
        <>
          {hqless && hqless.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
              <span className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <b className="text-[13.5px] font-extrabold text-gray-900">{hqless.length > 1 ? "Meetings with no HQ" : "Meeting with no HQ"}</b>
              </span>
              <small className="-mt-1.5 text-[12px] text-gray-600">Pick where it was — it is paid once your manager approves.</small>
              {hqless.map((ev) => (
                <div key={ev.name} className="flex flex-col gap-1.5">
                  <b className="text-[13px] font-bold text-gray-800">
                    {ev.type}
                    {ev.subject && ev.subject !== ev.type ? ` · ${ev.subject}` : ""}
                  </b>
                  <HqPicker value={draft.meeting_hq?.[ev.name] || ""} onChange={(hq) => setMeetHq(ev.name, hq)} seat={seat} />
                </div>
              ))}
            </section>
          )}
          <div className="flex flex-col gap-1.5">
            <b className="text-[14px] font-extrabold text-gray-900">
              {tasks.length ? "Anything else" : "What did you do"} on {dayLabel(date)}?
            </b>
            <small className="-mt-1 text-[12px] text-gray-500">Tick all that apply — visits and a meeting together is fine. Leave is the whole day, on its own.</small>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(({ type, label, hint, Icon, on }) => {
                const active = !!draft[type];
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(type)}
                    className={cn(
                      "relative flex flex-col items-start gap-1 rounded-2xl border-2 px-2.5 py-2.5 text-left transition-colors active:scale-[.98]",
                      active ? on : "border-gray-200 bg-white text-gray-700"
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border-2", active ? "border-current bg-current" : "border-gray-300")}>
                        {active && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />}
                      </span>
                    </span>
                    <b className="text-[13px] font-extrabold leading-tight">{label}</b>
                    <small className="text-[10.5px] font-semibold leading-tight opacity-75">{hint}</small>
                  </button>
                );
              })}
            </div>
          </div>
          {draft.doctor_visit && (
            <Section kind={KINDS[0]}>
              <DoctorFields e={draft.doctor_visit} seat={seat} onChange={patch("doctor_visit")} />
            </Section>
          )}
          {draft.other && (
            <Section kind={KINDS[1]}>
              <OtherFields e={draft.other} seat={seat} onChange={patch("other")} />
            </Section>
          )}
          {draft.leave && (
            <Section kind={KINDS[2]}>
              <small className="-mt-1 text-[12px] text-gray-600">The whole day, so nothing else goes with it. Your manager confirms it.</small>
              <NoteField e={draft.leave} onChange={patch("leave")} />
            </Section>
          )}
        </>
      )}
    </>
  );
}

const Section = ({ kind, children }) => (
  <section className="flex flex-col gap-2.5 rounded-2xl border border-gray-200 bg-white p-3">
    <span className="flex items-center gap-2">
      <i className={cn("h-2 w-2 rounded-full", kind.dot)} aria-hidden />
      <b className="text-[13.5px] font-extrabold text-gray-900">{kind.label}</b>
    </span>
    {children}
  </section>
);

/* the sticky bottom: what goes, and Send */
function SendBar({ date, tasks, draft, onSent }) {
  const f = useFieldExpenses();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [date]);
  // who it goes to, said before Send (21 Nov 2026)
  const [route, setRoute] = useState(null);
  useEffect(() => {
    fetchRoute().then(setRoute).catch(() => {});
  }, []);
  if (tasks.filter((t) => !DONE.has(t.status)).length >= 3) return null;
  const list = picked(draft);
  const err = list.map((e) => entryError(e.type, e)).find(Boolean);
  const nDoc = draft.doctor_visit?.doctors.length || 0;
  const nHq = Object.values(draft.meeting_hq || {}).filter(Boolean).length;
  const summary = [
    nDoc ? plural(nDoc, "doctor") : draft.doctor_visit ? "Doctor visits" : null,
    draft.other ? draft.other.other_type || "Meeting / other work" : null,
    draft.leave ? "Leave" : null,
    nHq ? `HQ for ${plural(nHq, "meeting")}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const send = async () => {
    setTried(true);
    if (!list.length || err) return;
    setBusy(true);
    try {
      const entries = list.map((e) => ({ ...e, ...(e.title != null ? { title: e.title.trim() } : {}), ...(e.note != null ? { note: e.note.trim() } : {}) }));
      const t = await sendNonReport({ month: f.month, date, entries });
      toast.success(`${dayLabel(date)} sent to ${t?.approver_names || "your manager"}`);
      setTried(false);
      onSent();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
      {tried && (err || !list.length) && <p className="mb-2 text-[12px] font-semibold text-rose-700">{err || "Tick what you did that day"}</p>}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-[12.5px] text-gray-500">
            {dayLabel(date)}
            {route?.approver_names ? ` · to ${route.approver_names}` : ""}
          </span>
          <b className="block truncate text-[15px] font-extrabold text-gray-900">{summary || "Nothing ticked yet"}</b>
        </div>
        <button
          type="button"
          disabled={busy || !list.length}
          onClick={send}
          className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-[15px] font-bold text-white active:scale-[.98] disabled:bg-gray-200 disabled:text-gray-500"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Send
        </button>
      </div>
    </div>
  );
}

function SentTask({ t }) {
  const st =
    t.status === "Completed"
      ? { label: "Approved", tone: "green" }
      : t.status === "Cancelled"
        ? { label: "Rejected", tone: "rose" }
        : HELP_STATUS[t.status]
          ? { ...HELP_STATUS[t.status], label: "Waiting" }
          : { label: t.status, tone: "gray" };
  const lines = askedText(t.description);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-2">
        <Pill tone={st.tone}>{st.label === "Raised" ? "Sent" : st.label}</Pill>
        <small className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-gray-500">
          {t.name} · {when(t.creation)}
        </small>
      </span>
      {lines && <p className="whitespace-pre-line text-[12.5px] leading-snug text-gray-800">{lines}</p>}
      {/* who decides / decided (21 Nov 2026) */}
      {t.status === "Completed" ? (
        <p className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[12.5px] text-green-800">
          Approved by <b>{t.decided_by_name || "your manager"}</b> · {(t.entries || []).some((x) => x.type === "leave") ? "marked as leave" : "added to your calendar, TA/DA updates in a few minutes"}
        </p>
      ) : t.status === "Cancelled" ? (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12.5px] text-rose-800">
          Rejected by <b>{t.decided_by_name || "your manager"}</b>
          {t.note ? ` — “${t.note}”` : ""} · you can send the day again
        </p>
      ) : t.approver_names ? (
        <p className="text-[12px] text-gray-500">
          Waiting for <b className="text-gray-700">{t.approver_names}</b>
          {t.escalation_names ? ` · ${t.escalation_names} can decide after 2 days` : ""}
        </p>
      ) : null}
      {(t.replies || []).filter((r) => !/^(Approved|Rejected): /.test(htmlText(r.content))).map((r, i) => (
        <div key={i} className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px]", r.mine ? "bg-gray-50 text-gray-700" : "bg-blue-50 text-blue-900")}>
          <b className="font-bold">{r.mine ? "You" : r.by}</b> <small className="text-[11px] text-gray-500">{when(r.at)}</small>
          <p className="whitespace-pre-line">{htmlText(r.content)}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- an entry ---------- */

const inputCls =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-[13.5px] text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const Label = ({ children, optional }) => (
  <span className="text-[11.5px] font-bold uppercase tracking-wide text-gray-500">
    {children}
    {optional && <span className="ml-1 font-semibold normal-case tracking-normal text-gray-400">optional</span>}
  </span>
);

function HqPicker({ value, onChange, seat }) {
  const { hqs } = seat;
  if (!hqs.length) return <small className="text-[12px] text-gray-500">{seat.ready ? "No HQ found for your seat" : "Loading your HQs…"}</small>;
  if (hqs.length <= 6) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {hqs.map((hq) => (
          <Chip key={hq} on={value === hq} onClick={() => onChange(hq)}>
            {hqName(hq)}
          </Chip>
        ))}
      </div>
    );
  }
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Pick the HQ</option>
      {hqs.map((hq) => (
        <option key={hq} value={hq}>
          {hqName(hq)}
        </option>
      ))}
    </select>
  );
}

const Chip = ({ on, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={cn(
      "rounded-full border px-3 py-1.5 text-[12.5px] font-bold",
      on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 active:bg-gray-50"
    )}
  >
    {children}
  </button>
);

function OtherFields({ e, seat, onChange }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {OTHER_KINDS.map((k) => (
          <Chip key={k} on={e.other_type === k} onClick={() => onChange({ other_type: k })}>
            {k}
          </Chip>
        ))}
      </div>
      {(e.other_type === "Conference" || e.other_type === "Meeting") && (
        <label className="flex flex-col gap-1">
          <Label>{e.other_type === "Meeting" ? "Title" : "Conference"}</Label>
          <input value={e.title} maxLength={140} onChange={(x) => onChange({ title: x.target.value })} placeholder={e.other_type === "Meeting" ? "e.g. Cycle meeting with ABM" : "Name of the conference"} className={inputCls} />
        </label>
      )}
      <div className="flex flex-col gap-1">
        <Label>HQ</Label>
        <HqPicker value={e.hq} onChange={(hq) => onChange({ hq })} seat={seat} />
      </div>
      <NoteField e={e} onChange={onChange} />
    </>
  );
}

const NoteField = ({ e, onChange }) => (
  <label className="flex flex-col gap-1">
    <Label optional>Note</Label>
    <textarea rows={2} value={e.note} maxLength={600} onChange={(x) => onChange({ note: x.target.value })} placeholder="Anything your manager should know" className={cn(inputCls, "resize-none")} />
  </label>
);

/* Doctor visits: the HQ, then the doctors as ONE compact row -- the long list
   (200+ doctors at an HQ) opens in its own panel over the sheet, so a meeting
   ticked with the visits sits right below and nobody scrolls past the list. */
function DoctorFields({ e, seat, onChange }) {
  const docs = useHqDoctors(e.hq, seat.rolesAt);
  const [picking, setPicking] = useState(false);
  const byId = useMemo(() => new Map(docs.list.map((d) => [d.value, d])), [docs.list]);
  const names = e.doctors.map((id) => byId.get(id)?.label || id);
  const SHOW = 4;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label>HQ</Label>
        {/* a new HQ has other doctors: the picks start again */}
        <HqPicker value={e.hq} onChange={(hq) => onChange(hq === e.hq ? {} : { hq, doctors: [] })} seat={seat} />
      </div>
      {e.hq && (
        <div className="flex flex-col gap-1">
          <Label>Doctors visited</Label>
          {docs.error ? (
            <small className="text-[12px] font-semibold text-rose-700">Couldn&apos;t load the doctors of {hqName(e.hq)} — close and open again.</small>
          ) : !docs.loading && !docs.list.length ? (
            <small className="text-[12px] text-gray-500">No doctors are mapped to your seat at {hqName(e.hq)}.</small>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left active:bg-gray-50",
                e.doctors.length ? "border-blue-200 bg-blue-50/60" : "border-dashed border-blue-400 bg-white"
              )}
            >
              <Stethoscope className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px] font-bold text-gray-900">
                  {e.doctors.length ? `${plural(e.doctors.length, "doctor")} picked` : docs.loading ? "Loading doctors…" : `Pick doctors · ${docs.list.length} at ${hqName(e.hq)}`}
                </b>
                {names.length > 0 && (
                  <small className="block truncate text-[11.5px] text-gray-600">
                    {names.slice(0, SHOW).join(", ")}
                    {names.length > SHOW ? ` +${names.length - SHOW} more` : ""}
                  </small>
                )}
              </span>
              <span className="shrink-0 text-[12.5px] font-extrabold text-blue-700">{e.doctors.length ? "Change" : "Pick"}</span>
            </button>
          )}
        </div>
      )}
      {picking && (
        // fixed inside the sheet (its panel is transformed): covers the sheet only
        <div className="fixed inset-0 z-30 flex flex-col bg-white" role="dialog" aria-label="Pick doctors">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <span className="min-w-0 flex-1">
              <b className="block text-[16px] font-extrabold text-gray-900">Doctors visited</b>
              <small className="block text-[12px] font-semibold text-gray-500">
                {hqName(e.hq)} · tick everyone you met
              </small>
            </span>
            {e.doctors.length > 0 && <Pill tone="blue">{e.doctors.length} picked</Pill>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <RHFDoctorCardSelector
              value={e.doctors}
              onChange={(v) => onChange({ doctors: Array.isArray(v) ? v : v ? [v] : [] })}
              options={docs.list}
              loading={docs.loading}
              hqTerritory={e.hq}
              multiple
            />
          </div>
          <div className="border-t border-gray-100 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => setPicking(false)}
              className={cn(
                "flex min-h-[48px] w-full items-center justify-center rounded-2xl text-[15px] font-bold active:scale-[.98]",
                e.doctors.length ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
              )}
            >
              {e.doctors.length ? `Done · ${plural(e.doctors.length, "doctor")}` : "Close"}
            </button>
          </div>
        </div>
      )}
      <NoteField e={e} onChange={onChange} />
    </>
  );
}

/* the agenda's line on a non-reported day */
export function NonReportDayRow({ date }) {
  const f = useFieldExpenses();
  const { tasks } = useNonReportTasks(f.month, true);
  const list = tasks.filter((t) => t.date === date);
  const row = f.dayOf(date);
  if (dayState(list) === "done") return null;
  const pill = dayPill(list);
  return (
    <button
      type="button"
      onClick={() => f.openNonReport(date)}
      className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
    >
      <CalendarX2 className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-bold text-gray-900">{row?.hqless ? "Meeting has no HQ · not paid" : "Nothing on record this day"}</b>
        <small className="block truncate text-xs text-gray-600">{list.length ? taskSummary(list[0]) : row?.hqless ? "Pick its HQ for your manager to approve" : "Add doctor visits, a meeting or other work"}</small>
      </span>
      <Pill tone={pill.tone}>{pill.label}</Pill>
    </button>
  );
}
