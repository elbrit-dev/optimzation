"use client";

/* Cab bills (20 Nov 2026, the user): SM and ZSM add the month's cab bills on a
   card of their own beside the Non-reported days card -- any number of them,
   no day asked (each bill's own date must fall inside the month), never part
   of TA/DA. They go to the reporting officer as ONE claim for the month; the
   officer's approval is final and Accounts pays it outside payroll.
   The sheet (the strip's Modal, kind "cab"): a summary band, the bills one per
   row (date, cab, amount, its check, View / Remove), and a footer with
   "Add cab bill" and "Send". ERP side: lib/field-expenses/cab-claims.js. */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CarTaxiFront, Check, ChevronRight, Eye, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { ModalTitle } from "@calendar/components/ui/responsive-modal";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { useFieldExpenses } from "@calendar/components/calendar/field/field-context";
import { ManualBill, useBillPicker } from "@calendar/components/calendar/field/field-bills";
import { inr } from "@calendar/lib/field-expenses/field-days";
import { addCabBill, cabTotals, cabTrip, readCabBill, recallCabs, removeCabBill, sendCabs, useCabs } from "@calendar/lib/field-expenses/cab-claims";
import { makeConn } from "../../../../../components/features/expense-claims/data/claimsApi";
import { FilePreview, billFile } from "../../../../../components/features/expense-claims/ui";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => MONTH_LONG[Number(ym.slice(5, 7)) - 1];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const errText = (e) => e?.message || String(e);
const dayNum = (iso) => Number(String(iso).slice(8, 10));
const dow = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });

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

/* where a claim stands, in the rep's words */
const claimPill = (c) =>
  c.done ? { tone: "green", label: "Approved" } : c.waiting ? { tone: "amber", label: "With officer" } : c.status === "Rejected" ? { tone: "rose", label: "Sent back" } : { tone: "blue", label: "Not sent" };

/* ---------- the card in the strip ---------- */

export function CabCard() {
  const f = useFieldExpenses();
  const { status, claims } = useCabs(f.emp, f.month, f.canCab);
  if (!f.canCab) return null;
  const t = cabTotals(claims);
  const pill = t.sentBack
    ? { tone: "rose", label: "Sent back" }
    : t.draft.count
      ? { tone: "blue", label: `${t.draft.count} to send` }
      : t.waiting.count
        ? { tone: "amber", label: "With officer" }
        : t.approved.count
          ? { tone: "green", label: "Approved" }
          : null;
  const foot = t.sentBack ? "Fix and send again" : t.draft.count ? `Send ${plural(t.draft.count, "bill")}` : t.count ? "Add more · see bills" : "Add a cab bill";
  return (
    <button
      type="button"
      onClick={() => f.openCab()}
      className={cn(
        "flex w-52 shrink-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-l-[3px] bg-white px-2.5 py-2 text-left shadow-sm active:opacity-80",
        t.sentBack ? "border-l-rose-500" : t.draft.count || !t.count ? "border-l-blue-500" : "border-l-gray-300"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <CarTaxiFront className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
        <b className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">Cab bills</b>
        {status === "loading" && !claims.length ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-hidden />
        ) : pill ? (
          <Pill tone={pill.tone} className="px-1.5 text-[9.5px]">{pill.label}</Pill>
        ) : null}
      </span>
      <span className="block truncate text-[11px] text-gray-500">
        {t.count ? `${plural(t.count, "bill")} · ${inr(t.total)} · not TA/DA` : `${monthName(f.month)} cab rides · not TA/DA`}
      </span>
      <span className={cn("mt-1 flex min-w-0 items-center gap-1 border-t border-dashed pt-1 text-[11.5px] font-bold", t.sentBack ? "text-rose-700" : "text-blue-700")}>
        <span className="min-w-0 flex-1 truncate">{foot}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </span>
    </button>
  );
}

/* ---------- the sheet ---------- */

export function CabSheet() {
  const f = useFieldExpenses();
  const month = f.month;
  const mon = monthName(month);
  const { status, claims, error } = useCabs(f.emp, month, true);
  const t = cabTotals(claims);
  const [billInput, pickBill] = useBillPicker();
  const [reading, setReading] = useState(0);
  const [busy, setBusy] = useState(""); // "send" | "recall" | line id being removed
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(null); // line id asked to remove
  const [manual, setManual] = useState(null); // { file, prefill, reason }
  const [viewing, setViewing] = useState(null); // bill url
  const conn = useMemo(() => {
    try {
      return AUTH_CONFIG.authToken ? makeConn({ url: AUTH_CONFIG.erpUrl, token: AUTH_CONFIG.authToken }) : null;
    } catch {
      return null;
    }
  }, []);

  // every bill of the month, newest claim's first; each row knows its claim
  const rows = claims.flatMap((c) => c.lines.map((l) => ({ ...l, claim: c }))).sort((a, b) => a.date.localeCompare(b.date));
  const sentBack = claims.find((c) => c.status === "Rejected" && c.lines.length);
  const waiting = claims.find((c) => c.waiting);
  const canChange = (c) => c.open || c.waiting;
  const files = rows.filter((r) => r.bill).map((r) => billFile(r.bill));

  const add = (bill) =>
    addCabBill({ employee: f.emp, month, bill }).then((r) => {
      toast.success(`Cab bill ${inr(bill.billed ?? bill.amount)} added${r.resent ? ` — sent to ${f.manager} again` : ""}`);
      if (r.warning) toast.message(r.warning, { duration: 8000 });
      if (bill.flag) toast.message(`${bill.flag} Your reporting officer will see this.`, { duration: 10000 });
    });

  const scan = () =>
    pickBill(async (file) => {
      const tid = toast.loading("Reading the cab bill…", { duration: Infinity });
      setReading((n) => n + 1);
      try {
        const r = await readCabBill(file, month);
        if (!r.ok) {
          if (r.manual) {
            toast.dismiss(tid);
            return setManual({ file, prefill: r.prefill, reason: r.reason });
          }
          toast.error(r.reason, { id: tid, duration: r.duplicate ? 10000 : 6000 });
          return;
        }
        toast.dismiss(tid);
        await add(r.bill);
      } catch (e) {
        toast.error(errText(e), { id: tid });
      } finally {
        setReading((n) => n - 1);
      }
    });

  const run = async (what, fn) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy("");
    }
  };
  const send = () =>
    run("send", async () => {
      await sendCabs({ employee: f.emp, month });
      setConfirm(false);
      toast.success(`${plural(t.draft.count, "cab bill")} sent to ${f.manager}`);
    });
  const recall = () => run("recall", async () => { await recallCabs({ employee: f.emp, month }); toast.success("Taken back — change it and send again"); });
  const remove = (line) =>
    run(line.id, async () => {
      await removeCabBill({ employee: f.emp, month, lineId: line.id });
      setRemoving(null);
      toast.success(`Cab bill ${inr(line.amount)} removed`);
    });

  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      {billInput}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:shrink-0">
        <div className="pr-10">
          <ModalTitle className="text-[22px] font-extrabold leading-tight tracking-tight text-gray-900">Cab bills</ModalTitle>
          <p className="mt-0.5 text-[14px] font-semibold text-gray-500">{mon} · kept apart from TA/DA</p>
        </div>

        {/* the month at a glance */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {[
            ["Bills", String(t.count)],
            ["Total", inr(t.total)],
            ["Approved", inr(t.approved.total)],
          ].map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col px-3 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k}</span>
              <b className="truncate text-[17px] font-extrabold tabular-nums text-gray-900">{v}</b>
            </div>
          ))}
        </div>

        <p className="rounded-xl bg-gray-50 px-3 py-2 text-[12.5px] leading-snug text-gray-600">
          Every cab ride of {mon} — Ola, Uber, taxi. No day to pick: the bill&apos;s own date counts. {f.manager} approves.
        </p>

        {sentBack && (
          <div className="flex flex-col gap-0.5 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] leading-snug text-rose-900">
            <b className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">Sent back by {f.manager}</b>
            <span>{sentBack.reason ? `“${sentBack.reason}”` : "No reason given."} Remove or add bills, then send again.</span>
          </div>
        )}
        {waiting && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
            <span className="min-w-0 flex-1">
              <b>With {f.manager}</b> · {plural(waiting.lines.length, "bill")} · {inr(waiting.lines.reduce((s, l) => s + l.amount, 0))}. A bill you add or remove now goes back to them updated.
            </span>
            <button type="button" disabled={!!busy} onClick={recall} className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] font-bold text-amber-800 disabled:opacity-60">
              {busy === "recall" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Undo2 className="h-3.5 w-3.5" aria-hidden />} Take back
            </button>
          </div>
        )}

        {/* the bills */}
        {status === "error" && !rows.length ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">The cab bills could not be loaded ({errText(error)}). Close and open again.</p>
        ) : status === "loading" && !rows.length && !reading ? (
          <div className="flex items-center gap-2 px-1 py-3 text-[13px] text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your cab bills…
          </div>
        ) : rows.length || reading ? (
          <ol className="flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {rows.map((r) => {
              const p = claimPill(r.claim);
              const asking = removing === r.id;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                      <b className="text-[17px] font-extrabold text-gray-900">{dayNum(r.date)}</b>
                      <small className="mt-0.5 text-[10px] font-bold uppercase text-gray-500">{dow(r.date)}</small>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="truncate text-[13.5px] font-bold text-gray-900">{r.vendor}</b>
                      <span className={cn("truncate text-[11.5px]", r.checked && (r.score ?? 0) < 90 ? "text-amber-700" : "text-gray-500")}>
                        {r.checked ? (
                          <>
                            <Check className="mr-0.5 inline h-3 w-3 text-green-600" aria-hidden />
                            {(r.score ?? 0) >= 90 ? "Checked — cab, date and bill read" : r.check}
                          </>
                        ) : (
                          "Bill check pending"
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <b className="text-[14px] font-extrabold tabular-nums text-gray-900">{inr(r.amount)}</b>
                      <Pill tone={p.tone} className="px-1.5 text-[9.5px]">{p.label}</Pill>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-[52px]">
                    {r.bill && (
                      <button type="button" onClick={() => setViewing(r.bill)} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> View bill
                      </button>
                    )}
                    {canChange(r.claim) &&
                      (asking ? (
                        <span className="flex items-center gap-1.5">
                          <button type="button" disabled={!!busy} onClick={() => remove(r)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-60">
                            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Remove {inr(r.amount)}
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => setRemoving(null)} className="rounded-lg px-2 py-1 text-[12px] font-bold text-gray-500">
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" disabled={!!busy} onClick={() => setRemoving(r.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-gray-500 hover:text-rose-700">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
            {reading > 0 && (
              <li className="flex items-center gap-3 px-3 py-3 text-[13px] text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden /> Reading the cab bill{reading > 1 ? `s (${reading})` : ""}…
              </li>
            )}
          </ol>
        ) : (
          <button
            type="button"
            onClick={scan}
            className="flex flex-col items-center gap-1 rounded-2xl border-[1.5px] border-dashed border-blue-300 bg-blue-50/40 px-4 py-6 text-center"
          >
            <CarTaxiFront className="h-6 w-6 text-blue-600" aria-hidden />
            <b className="text-[14px] font-extrabold text-blue-800">No cab bills for {mon} yet</b>
            <span className="text-[12.5px] text-gray-600">Take a photo of the bill or upload the PDF / screenshot</span>
          </button>
        )}
      </div>

      {/* footer: add, and send what is not sent */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
        {confirm ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50/60 p-3">
            <b className="text-[14px] text-gray-900">
              Send {plural(t.draft.count, "cab bill")} · {inr(t.draft.total)}?
            </b>
            <span className="text-[12.5px] leading-snug text-gray-600">To {f.manager} for approval — final once approved.</span>
            <span className="flex gap-2">
              <button type="button" disabled={busy === "send"} onClick={() => setConfirm(false)} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white text-[14px] font-bold text-gray-800">
                Cancel
              </button>
              <button type="button" disabled={busy === "send"} onClick={send} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-bold text-white disabled:opacity-60">
                {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Yes, send
              </button>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={scan}
              className={cn(
                "flex min-h-[52px] items-center justify-center gap-1.5 rounded-2xl px-4 text-[15px] font-bold disabled:opacity-60",
                t.draft.count ? "border-[1.5px] border-dashed border-blue-300 bg-white text-blue-700" : "flex-1 bg-blue-600 text-white"
              )}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add cab bill
            </button>
            {t.draft.count > 0 && (
              <button type="button" disabled={!!busy || reading > 0} onClick={() => setConfirm(true)} className="flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-2xl bg-blue-600 px-4 text-white disabled:opacity-60">
                <b className="text-[15px] font-bold leading-tight">Send {plural(t.draft.count, "bill")}</b>
                <small className="text-[12px] font-semibold text-blue-100">{inr(t.draft.total)} to {f.manager}</small>
              </button>
            )}
          </div>
        )}
      </div>

      {manual && (
        <ManualBill
          file={manual.file}
          slot="cabs"
          trip={cabTrip(month)}
          prefill={manual.prefill}
          reason={manual.reason}
          onCancel={() => setManual(null)}
          onDone={(_slot, bill) =>
            run("manual", async () => {
              await add(bill);
              setManual(null);
            })
          }
        />
      )}
      {viewing && conn && <FilePreview conn={conn} file={billFile(viewing)} files={files} onClose={() => setViewing(null)} />}
    </div>
  );
}
