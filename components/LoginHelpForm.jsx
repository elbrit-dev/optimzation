import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, HelpCircle, Loader2, X } from "lucide-react";

/**
 * LoginHelpForm — the "Can't log in?" escape hatch for the login screen.
 *
 * Renders a small trigger link plus the modal it opens. Drop it on the login
 * page in Plasmic, next to the sign-in widget; it needs no props to work.
 *
 * Flow:
 *   Employee ID + mobile  ->  POST /api/hr/employee-lookup  (confirms the pair
 *                             and auto-fills name + designation)
 *   Submit                ->  POST /api/hr/login-help       (creates an ERP
 *                             Task, assigned to HR, with a diagnosis of WHY
 *                             the login is failing)
 *
 * Why the endpoints and not a direct ERP call: this form runs BEFORE login, so
 * the per-user ERP token the rest of the app uses doesn't exist yet. The routes
 * hold a server-side service account instead — see lib/erpServer.js.
 *
 * Auto-fill is deliberately gated on the phone matching `cell_number` in ERP.
 * An unverified pair is NOT an error — it's usually the bug itself — so the
 * form stays fully submittable either way.
 */

const LOOKUP_DEBOUNCE_MS = 600;

const digitsOnly = (s) => String(s ?? "").replace(/\D/g, "");

export default function LoginHelpForm({
  className,
  triggerLabel = "Can't log in? Click here",
  title = "Tell HR you can't log in",
  subtitle = "Fill this in and HR will get a ticket with your details straight away.",
  submitLabel = "Send to HR",
  accentColor = "#2563eb",
  lookupEndpoint = "/api/hr/employee-lookup",
  submitEndpoint = "/api/hr/login-help",
  showNoteField = true,
  // ERP routing. Every one of these is optional — left empty, the API route
  // falls back to its env var and then to a baked-in default (project
  // "LoginIssue", assignee hr@elbrit.org, target ERP). They exist so the page
  // can be retuned from Studio without a Netlify change + redeploy.
  project = "",
  assignee = "",
  erpTarget = "",
  erpUrl = "",
  authToken = "",
  onSubmitted,
}) {
  // Sent with both requests. Empty strings are dropped server-side by the
  // prop → env → default chain, so passing them through is always safe.
  const erpRouting = { erpTarget, erpUrl, authToken };
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [lookup, setLookup] = useState({ state: "idle", employeeName: "" });
  const [submitState, setSubmitState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const firstFieldRef = useRef(null);
  // Guards against a slow lookup landing after a newer one and overwriting it.
  const lookupSeq = useRef(0);

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    setEmployeeId("");
    setDesignation("");
    setPhone("");
    setNote("");
    setLookup({ state: "idle", employeeName: "" });
    setSubmitState("idle");
    setResult(null);
    setError("");
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Keep a success message readable if they reopen immediately; only clear
    // once they've actually seen the outcome.
    if (submitState === "done") reset();
  }, [submitState, reset]);

  // Esc to close + lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
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

  // Confirm the ID/phone pair once both look complete.
  useEffect(() => {
    const id = employeeId.trim();
    const mobile = digitsOnly(phone).slice(-10);

    if (!id || mobile.length < 10) {
      setLookup({ state: "idle", employeeName: "" });
      return;
    }

    const seq = ++lookupSeq.current;
    setLookup({ state: "checking", employeeName: "" });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(lookupEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: id, phone: mobile, ...erpRouting }),
        });
        const data = await res.json();
        if (seq !== lookupSeq.current) return; // a newer keystroke already won

        if (data?.verified) {
          setLookup({ state: "verified", employeeName: data.employeeName || "" });
          // Only fill what they haven't typed themselves.
          setDesignation((current) => current.trim() || data.designation || "");
        } else {
          setLookup({ state: "unverified", employeeName: "" });
        }
      } catch {
        if (seq !== lookupSeq.current) return;
        setLookup({ state: "idle", employeeName: "" });
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Depend on the routing primitives, not the `erpRouting` object — that's a
    // fresh reference each render and would re-fire the lookup on every keystroke.
  }, [employeeId, phone, lookupEndpoint, erpTarget, erpUrl, authToken]);

  const canSubmit =
    employeeId.trim() &&
    designation.trim() &&
    digitsOnly(phone).length >= 10 &&
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
          employeeId: employeeId.trim(),
          designation: designation.trim(),
          phone: phone.trim(),
          note: note.trim(),
          project,
          assignee,
          ...erpRouting,
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

  const sheet = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && submitState !== "done" && (
              <p className="mt-1 text-[13px] leading-snug text-gray-500">{subtitle}</p>
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
              {result?.duplicate ? "HR already has your request" : "Sent to HR"}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              {result?.duplicate
                ? "We found an open ticket for you, so we didn't raise a duplicate."
                : "HR has been assigned your request and will get back to you."}
            </p>
            {result?.ticket && (
              <p className="mt-3 inline-block rounded-md bg-gray-100 px-2.5 py-1 font-mono text-[13px] text-gray-700">
                {result.ticket}
              </p>
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
            <div>
              <label htmlFor="lh-empid" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                Employee ID
              </label>
              <input
                id="lh-empid"
                ref={firstFieldRef}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                placeholder="E01271"
                autoComplete="off"
                autoCapitalize="characters"
                className={field}
                style={{ "--tw-ring-color": accentColor }}
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
              {/* The unverified case is usually the bug being reported, so it
                  reads as information, not as a validation failure. */}
              {lookup.state === "checking" && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-gray-500">
                  <Loader2 size={13} className="animate-spin" /> Checking your details…
                </p>
              )}
              {lookup.state === "verified" && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-green-600">
                  <CheckCircle2 size={13} />
                  {lookup.employeeName ? `Found you — ${lookup.employeeName}` : "Details confirmed"}
                </p>
              )}
              {lookup.state === "unverified" && (
                <p className="mt-1.5 text-[12px] text-amber-600">
                  This number doesn't match the one HR has for that Employee ID — which may well be
                  why you can't log in. Send it anyway and HR will sort it out.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="lh-desig" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                Designation
              </label>
              <input
                id="lh-desig"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Business Executive"
                className={field}
                style={{ "--tw-ring-color": accentColor }}
              />
            </div>

            {showNoteField && (
              <div>
                <label htmlFor="lh-note" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                  What happens when you try? <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="lh-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. I never receive the OTP"
                  className={`${field} resize-none`}
                  style={{ "--tw-ring-color": accentColor }}
                />
              </div>
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
              {submitState === "sending" ? "Sending…" : submitLabel}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-2 hover:underline"
        style={{ color: accentColor }}
      >
        <HelpCircle size={15} />
        {triggerLabel}
      </button>
      {mounted && open && createPortal(sheet, document.body)}
    </div>
  );
}
