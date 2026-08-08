import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, HelpCircle, Loader2, X } from "lucide-react";

/**
 * LoginHelpForm — the "Can't log in?" escape hatch for the login screen.
 *
 * Renders a small trigger link plus the modal it opens. Drop it on the login
 * page in Plasmic, next to the sign-in widget; it needs no props to work.
 *
 * Deliberately a plain form: three fields, submit, done. It does NOT check the
 * employee's details as they type. Nobody who is already locked out should be
 * argued with by a form, and the checks that would matter aren't reliable
 * anyway — `User.mobile_no` is empty on all but a couple of ERP Users, so
 * verifying the phone would flag nearly everyone as wrong.
 *
 * The diagnosis still happens, just out of sight: POST /api/hr/login-help
 * reads the Employee record and the ERP User it links to, and puts the actual
 * cause (no user_id, User disabled, employee not Active) into the ticket HR
 * receives. See lib/loginDiagnostics.js.
 *
 * Why an endpoint and not a direct ERP call: this form runs BEFORE login, so
 * the per-user ERP token the rest of the app uses doesn't exist yet. The route
 * holds the credentials server-side — see lib/erpServer.js.
 */

const digitsOnly = (s) => String(s ?? "").replace(/\D/g, "");

export default function LoginHelpForm({
  className,
  triggerLabel = "Can't log in? Click here",
  title = "Tell HR you can't log in",
  subtitle = "Fill this in and HR will get a ticket with your details straight away.",
  reassurance = "HR will check your account and get back to you.",
  submitLabel = "Send to HR",
  accentColor = "#2563eb",
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
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [submitState, setSubmitState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const firstFieldRef = useRef(null);

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    setEmployeeId("");
    setDesignation("");
    setPhone("");
    setNote("");
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
                ? "We found an open request for you, so we didn't send a second one."
                : "HR will check your account and get back to you."}
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
              <input
                id="lh-desig"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Business Executive"
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
              <p className="mt-1.5 text-[12px] text-gray-500">
                The number you're trying to sign in with.
              </p>
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

            {reassurance && (
              <p className="text-center text-[12px] leading-snug text-gray-500">{reassurance}</p>
            )}
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
