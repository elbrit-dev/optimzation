import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  HelpCircle,
  Loader2,
  X,
} from "lucide-react";
import { useConsoleCapture } from "../lib/consoleCapture";

/**
 * LoginHelpForm — one component, two jobs, switched by `variant`.
 *
 * "login"   The "Can't log in?" escape hatch for the LOGIN page. Runs before
 *           anyone is signed in. Raises an HR ticket that already says WHY the
 *           login is failing (empty user_id, disabled ERP User, inactive
 *           employee) — see lib/loginDiagnostics.js.
 *
 * "in-app"  "Something looks wrong? Report it", for use INSIDE the app — someone
 *           on the home page seeing blanks or zeros. Asks ONE question and
 *           nothing else: identity comes from the `employee` prop (they're
 *           signed in — making them retype their own details would be absurd),
 *           and the browser console errors and page context are attached on
 *           send. Files to BUGS - IT for MIS. It says SUPPORT, never HR: the
 *           person looking at a blank screen has no reason to think about HR,
 *           and HR is not who fixes it.
 *
 * Both are deliberately plain forms: nothing is validated against ERP in front
 * of the person. Someone already stuck shouldn't also be told they typed their
 * own details wrong.
 *
 * Why an endpoint and not a direct ERP call: the login variant runs before
 * login, so the per-user ERP token the rest of the app uses doesn't exist yet.
 * The route holds the credentials server-side — see lib/erpServer.js.
 */

const digitsOnly = (s) => String(s ?? "").replace(/\D/g, "");

/**
 * Flattens whatever the page binds to `employee` into the four values we need.
 *
 * Accepts a RAW ERP Employee doc as-is, which is the usual thing to have to
 * hand: there `name` is the Employee ID (E01271) and `employee_name` is the
 * person — a collision worth handling here rather than making every page
 * remap it. Plain {id, name, designation, phone} works too.
 */
function normalizeEmployee(employee) {
  const e = employee && typeof employee === "object" ? employee : {};
  const str = (v) => String(v ?? "").trim();

  return {
    id: str(e.employeeId ?? e.employee ?? e.id ?? e.name),
    // e.name is the ID on an ERP doc, so it is deliberately NOT a fallback here.
    fullName: str(e.employeeName ?? e.employee_name ?? e.fullName ?? e.full_name),
    designation: str(e.designation),
    phone: str(e.phone ?? e.cell_number ?? e.mobile ?? e.mobile_no),
  };
}

// Copy defaults per variant. Any of these can still be overridden by a prop;
// leaving a prop empty falls back to whichever variant is active.
const VARIANT_COPY = {
  login: {
    triggerLabel: "Can't log in? Click here",
    title: "Tell HR you can't log in",
    subtitle: "Fill this in and HR will get a ticket with your details straight away.",
    submitLabel: "Send to HR",
    reassurance: "HR will check your account and get back to you.",
    noteLabel: "What happens when you try?",
    notePlaceholder: "e.g. I never receive the OTP",
    doneTitle: "Sent to HR",
    doneBody: "HR will check your account and get back to you.",
    duplicateTitle: "HR already has your request",
    duplicateBody: "We found an open request for you, so we didn't send a second one.",
    existingTitle: "HR is already on it",
    existingBody: "You've already told us about this. Here's where it's got to.",
  },
  // Nothing here says "HR" — this variant goes to support, not to HR, and the
  // person reporting a blank screen has no reason to think about either.
  "in-app": {
    triggerLabel: "Something looks wrong? Report it",
    title: "Report a problem",
    subtitle: "Send this and support gets the error details from your screen automatically.",
    submitLabel: "Send to support",
    reassurance: "Support will look into it and get back to you.",
    noteLabel: "What looks wrong?",
    notePlaceholder: "e.g. My home page shows 0 for everything",
    doneTitle: "Sent to support",
    doneBody: "Thanks — support has what they need to look into it.",
    duplicateTitle: "Already reported",
    duplicateBody: "There's an open report for this already, so we didn't send a duplicate.",
    existingTitle: "Support is already on it",
    existingBody: "You've already reported this. Here's where it's got to.",
  },
};


/**
 * Searchable designation picker. ERP has ~85 designations, which is far too
 * many for a plain <select> on a phone, so this is a combobox: type to filter,
 * arrows + Enter to pick.
 *
 * It accepts free text on purpose. If ERP is unreachable the list arrives empty
 * and this quietly becomes a normal text input — the whole point of the form is
 * that it still works when things are broken.
 */
function DesignationPicker({ value, onChange, options, loading, accentColor, fieldClass }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    // An exact hit means they've already chosen — show the full list again
    // rather than a single row they can't escape from.
    if (!q || options.some((o) => o.toLowerCase() === q)) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [value, options]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (option) => {
    onChange(option);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (!matches.length) return;
      return setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + matches.length) % matches.length;
      });
    }
    if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      return choose(matches[active]);
    }
    if (e.key === "Escape" && open) {
      // Swallow it so the whole modal doesn't close along with the menu.
      e.stopPropagation();
      setOpen(false);
    }
    return undefined;
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        id="lh-desig"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={loading ? "Loading designations…" : "Start typing, e.g. Business Executive"}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="lh-desig-list"
        aria-autocomplete="list"
        className={`${fieldClass} pr-9`}
        style={{ "--tw-ring-color": accentColor }}
      />

      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={16} />}
      </span>

      {open && matches.length > 0 && (
        <ul
          id="lh-desig-list"
          role="listbox"
          className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                // mousedown, not click — the input's blur would tear the list
                // down before a click ever landed.
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-[14px] ${
                i === active ? "bg-gray-100 text-gray-900" : "text-gray-700"
              }`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ERP Task statuses, in words that mean something outside ERP. */
const STATUS_COPY = {
  Open: { label: "Received", tone: "bg-amber-50 text-amber-700" },
  Working: { label: "Being looked at", tone: "bg-blue-50 text-blue-700" },
  "Pending Review": { label: "Being checked", tone: "bg-blue-50 text-blue-700" },
  Overdue: { label: "Being looked at", tone: "bg-amber-50 text-amber-700" },
  Completed: { label: "Resolved", tone: "bg-green-50 text-green-700" },
  Cancelled: { label: "Closed", tone: "bg-gray-100 text-gray-600" },
};

/** ERP hands back "2026-08-08 10:47:59.123456"; nobody needs the microseconds. */
function formatRaisedAt(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "";
  }
}

function TicketCard({ ticket }) {
  if (!ticket?.id) return null;
  const status = STATUS_COPY[ticket.status] || STATUS_COPY.Open;
  const raisedAt = formatRaisedAt(ticket.raisedAt);

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12.5px] text-gray-600">{ticket.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>
      {ticket.subject && (
        <p className="mt-1.5 text-[13px] leading-snug text-gray-700">{ticket.subject}</p>
      )}
      {raisedAt && <p className="mt-1.5 text-[11.5px] text-gray-400">Reported {raisedAt}</p>}
    </div>
  );
}

export default function LoginHelpForm({
  className,
  variant = "login",

  // Copy — leave empty to use the active variant's wording.
  triggerLabel = "",
  title = "",
  subtitle = "",
  submitLabel = "",
  reassurance = "",

  accentColor = "#2563eb",
  submitEndpoint = "/api/hr/login-help",
  designationsEndpoint = "/api/hr/designations",
  ticketStatusEndpoint = "/api/hr/ticket-status",
  showNoteField = true,

  // Who is reporting — ONE object, not four strings. In-app the person is
  // already signed in, so the page passes this down and the form asks for none
  // of it. Bind a raw ERP Employee doc straight to it; see normalizeEmployee.
  employee,

  // Console capture. Defaults on for in-app, off for login (where there is no
  // app running yet to produce anything worth capturing).
  captureConsole,

  // ERP routing. Every one of these is optional — left empty, the API route
  // falls back to its env var and then to the active variant's default.
  project = "",
  assignee = "",
  erpTarget = "",
  erpUrl = "",
  authToken = "",
  onSubmitted,
}) {
  const mode = variant === "in-app" ? "in-app" : "login";
  const copy = VARIANT_COPY[mode];
  const isInApp = mode === "in-app";

  const text = (prop, key) => (String(prop ?? "").trim() ? prop : copy[key]);

  const shouldCapture = captureConsole === undefined ? isInApp : Boolean(captureConsole);
  const collectDiagnostics = useConsoleCapture(shouldCapture);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const who = useMemo(() => normalizeEmployee(employee), [employee]);

  // In-app, identity comes from the prop and is never asked for. The one case
  // that still needs a field is a page that didn't pass an Employee ID — better
  // a visible input than a report nobody can trace back to a person.
  const identityFromProps = isInApp && Boolean(who.id);

  const [employeeId, setEmployeeId] = useState(who.id);
  const [designation, setDesignation] = useState(who.designation);
  const [phone, setPhone] = useState(who.phone);
  const [note, setNote] = useState("");

  const [submitState, setSubmitState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [designations, setDesignations] = useState([]);
  const [designationsLoading, setDesignationsLoading] = useState(false);

  // An already-open ticket, looked up before we offer to raise another.
  const [openTicket, setOpenTicket] = useState(null);
  const [checkingTicket, setCheckingTicket] = useState(false);

  const firstFieldRef = useRef(null);
  const designationsLoaded = useRef(false);

  useEffect(() => setMounted(true), []);

  // Ask ERP whether they already have one open, every time the sheet opens —
  // not once per session, because its status changes while they wait and
  // "Working" is exactly the reassurance they came back for.
  useEffect(() => {
    if (!open || !employeeId) return undefined;

    let cancelled = false;
    setCheckingTicket(true);

    fetch(ticketStatusEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant: mode,
        employeeId,
        project,
        erpTarget,
        erpUrl,
        authToken,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setOpenTicket(data?.ticket ?? null);
      })
      .catch(() => {
        // Let them send. The submit route dedupes anyway, so the worst case is
        // one wasted tap rather than a lost report.
        if (!cancelled) setOpenTicket(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingTicket(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, employeeId, mode, ticketStatusEndpoint, project, erpTarget, erpUrl, authToken]);

  // The page usually resolves the signed-in user AFTER mount, so adopt those
  // values when they land — but never overwrite something already typed.
  useEffect(() => {
    setEmployeeId((v) => v || who.id);
    setDesignation((v) => v || who.designation);
    setPhone((v) => v || who.phone);
  }, [who]);

  // Fetched when the sheet first opens, not on page load — most visitors never
  // touch it. Once per session; the route caches server-side too. Skipped
  // entirely in-app, where there is no designation field to fill.
  useEffect(() => {
    if (isInApp || !open || designationsLoaded.current) return undefined;
    designationsLoaded.current = true;

    let cancelled = false;
    setDesignationsLoading(true);

    fetch(designationsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ erpTarget, erpUrl, authToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setDesignations(data?.designations ?? []);
      })
      .catch(() => {
        // Falls back to free text — never block the form on this.
        if (!cancelled) setDesignations([]);
      })
      .finally(() => {
        if (!cancelled) setDesignationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isInApp, open, designationsEndpoint, erpTarget, erpUrl, authToken]);

  const reset = useCallback(() => {
    setEmployeeId(who.id);
    setDesignation(who.designation);
    setPhone(who.phone);
    setNote("");
    setSubmitState("idle");
    setResult(null);
    setError("");
  }, [who]);

  const close = useCallback(() => {
    setOpen(false);
    // Keep a success message readable if they reopen immediately; only clear
    // once they've actually seen the outcome.
    if (submitState === "done") reset();
  }, [submitState, reset]);

  // Esc to close + lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // In-app asks for nothing at all — identity comes from the prop and the
  // console capture is the report, so the only control is the button itself.
  const canSubmit =
    (isInApp
      ? Boolean(employeeId.trim())
      : employeeId.trim() && designation.trim() && digitsOnly(phone).length >= 10) &&
    submitState !== "sending";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitState("sending");
    setError("");

    try {
      const res = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: mode,
          employeeId: employeeId.trim(),
          employeeName: who.fullName,
          designation: designation.trim(),
          phone: phone.trim(),
          note: note.trim(),
          diagnostics: shouldCapture ? collectDiagnostics() : null,
          project,
          assignee,
          erpTarget,
          erpUrl,
          authToken,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }

      setResult(data);
      setSubmitState("done");
      onSubmitted?.(data.ticket, Boolean(data.duplicate));
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitState("error");
    }
  }

  const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] outline-none focus:border-transparent focus:ring-2 disabled:bg-gray-50";

  // The login variant is a bottom sheet — it's reached one-handed on a phone at
  // the moment of failure. The in-app variant is a centred dialog, which is the
  // ordinary shape for a deliberate action taken mid-session.
  const overlayClass = isInApp
    ? "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
    : "fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4";
  const panelClass = isInApp
    ? "max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl"
    : "max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl";

  const sheet = (
    <div
      className={overlayClass}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={text(title, "title")}
        className={panelClass}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{text(title, "title")}</h2>
            {submitState !== "done" && (
              <p className="mt-1 text-[13px] leading-snug text-gray-500">
                {text(subtitle, "subtitle")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {submitState === "done" ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-green-500" />
            <p className="mt-3 text-[15px] font-semibold text-gray-900">
              {result?.duplicate ? copy.duplicateTitle : copy.doneTitle}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              {result?.duplicate ? copy.duplicateBody : copy.doneBody}
            </p>
            {result?.ticket && (
              <TicketCard ticket={result.ticketInfo || { id: result.ticket }} />
            )}
            <button
              type="button"
              onClick={close}
              className="mt-6 w-full rounded-lg py-2.5 text-[15px] font-medium text-white"
              style={{ backgroundColor: accentColor }}
            >
              Done
            </button>
          </div>
        ) : checkingTicket ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-[13px] text-gray-500">
            <Loader2 size={15} className="animate-spin" />
            Checking your reports…
          </div>
        ) : openTicket ? (
          // Already reported. Showing the ticket and its progress is the whole
          // point — otherwise they tap send, are told "already reported", and
          // learn nothing they could not have been told before tapping.
          <div className="px-5 py-7 text-center">
            <ClipboardCheck size={40} className="mx-auto" style={{ color: accentColor }} />
            <p className="mt-3 text-[15px] font-semibold text-gray-900">{copy.existingTitle}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{copy.existingBody}</p>
            <TicketCard ticket={openTicket} />
            <button
              type="button"
              onClick={close}
              className="mt-6 w-full rounded-lg py-2.5 text-[15px] font-medium text-white"
              style={{ backgroundColor: accentColor }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
            {/* The description leads for a bug report: it's the part only the
                person reporting can supply. For a login request the identity
                fields lead, because the diagnosis keys off them. */}
            {/* IN-APP: no inputs at all. Who they are comes from the prop, the
                console capture is the report, and the button is the whole UI. */}
            {isInApp ? (
              <>
                {identityFromProps ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                    <p className="text-[12px] text-gray-500">Reporting as</p>
                    <p className="mt-0.5 text-[14px] font-medium text-gray-800">
                      {who.fullName ? `${who.fullName} · ${employeeId}` : employeeId}
                    </p>
                  </div>
                ) : (
                  // The page didn't pass an employee, so ask — a report nobody
                  // can trace back to a person is close to useless.
                  <div>
                    <label htmlFor="lh-empid" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                      Employee ID
                    </label>
                    <input
                      id="lh-empid"
                      ref={firstFieldRef}
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                      placeholder="E01288"
                      autoComplete="off"
                      autoCapitalize="characters"
                      className={field}
                      style={{ "--tw-ring-color": accentColor }}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="lh-empid" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                    Employee ID
                  </label>
                  <input
                    id="lh-empid"
                    ref={firstFieldRef}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                    placeholder="E01288"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className={field}
                    style={{ "--tw-ring-color": accentColor }}
                  />
                </div>

                <div>
                  <label htmlFor="lh-desig" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                    Designation
                  </label>
                  <DesignationPicker
                    value={designation}
                    onChange={setDesignation}
                    options={designations}
                    loading={designationsLoading}
                    accentColor={accentColor}
                    fieldClass={field}
                  />
                </div>

                <div>
                  <label htmlFor="lh-phone" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                    Mobile number
                  </label>
                  <input
                    id="lh-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    inputMode="numeric"
                    autoComplete="tel"
                    className={field}
                    style={{ "--tw-ring-color": accentColor }}
                  />
                  <p className="mt-1.5 text-[12px] text-gray-500">
                    The number you're trying to sign in with.
                  </p>
                </div>

                {showNoteField && (
                  <div>
                    <label htmlFor="lh-note" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                      {copy.noteLabel} <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      id="lh-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder={copy.notePlaceholder}
                      className={`${field} resize-none`}
                      style={{ "--tw-ring-color": accentColor }}
                    />
                  </div>
                )}
              </>
            )}

            {/* Say what's being sent. Attaching console output silently would
                be a surprise, and people should know before they hit send. */}
            {shouldCapture && (
              <p className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-snug text-gray-500">
                <AlertTriangle size={13} className="mt-0.5 flex-none text-gray-400" />
                Recent error messages and failed requests from the app, the page you're on and your
                device details are attached automatically, so support can see what went wrong.
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              {submitState === "sending" && <Loader2 size={16} className="animate-spin" />}
              {submitState === "sending" ? "Sending…" : text(submitLabel, "submitLabel")}
            </button>

            <p className="text-center text-[12px] leading-snug text-gray-500">
              {text(reassurance, "reassurance")}
            </p>
          </form>
        )}
      </div>
    </div>
  );

  // The login trigger is a quiet text link under the sign-in buttons; the
  // in-app one is a real button, because it's a deliberate action rather than
  // a last resort.
  const trigger = isInApp ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
    >
      <AlertTriangle size={14} style={{ color: accentColor }} />
      {text(triggerLabel, "triggerLabel")}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-2 hover:underline"
      style={{ color: accentColor }}
    >
      <HelpCircle size={15} />
      {text(triggerLabel, "triggerLabel")}
    </button>
  );

  return (
    <div className={className}>
      {trigger}
      {mounted && open && createPortal(sheet, document.body)}
    </div>
  );
}
