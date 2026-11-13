"use client";

/* Bills attached in the Field layer: the Take photo / Upload chooser, the
   dashed "scan …" chip, an attached bill's chip, and its amount editor.
   Used by the trip sheet (fuel, toll, stay, food). */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BedDouble, Camera, Check, Fuel, Loader2, Route, Upload, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { inr } from "@calendar/lib/field-expenses/field-days";
import { BILL_ACCEPT, checkBillFile, enterTripBill, warmReader } from "@calendar/lib/field-expenses/bill-reader";
import { MANUAL_KINDS, addDays } from "@calendar/lib/field-expenses/bill-rules";

/* Attaching a bill: "Take photo" opens the camera, "Upload from device"
   picks a saved photo or PDF. Two hidden inputs, one with `capture` (the
   camera) and one without (the files). The choice shows over the sheet on a
   phone; a desktop has no camera through a file input, so it goes straight
   to the files. */
const FILES_ONLY_QUERY = "(hover: hover) and (pointer: fine)";

export function useBillPicker() {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const pending = useRef(null);
  const [asking, setAsking] = useState(false);
  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const fn = pending.current;
    pending.current = null;
    if (!file || !fn) return;
    const bad = checkBillFile(file);
    if (bad) return toast.error(bad);
    fn(file);
  };
  const open = (ref) => {
    setAsking(false);
    ref.current?.click();
  };
  const cancel = () => {
    setAsking(false);
    pending.current = null;
  };
  const input = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
      <input ref={fileRef} type="file" accept={BILL_ACCEPT} className="hidden" onChange={onChange} />
      {asking && (
        // fixed inside the sheet (its panel is transformed): covers the sheet only
        <div className="fixed inset-0 z-30 flex items-end bg-black/30" onClick={cancel}>
          <div
            role="dialog"
            aria-label="Attach bill"
            className="w-full rounded-t-3xl bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <b className="block px-1 pb-2 text-[15px] font-extrabold text-gray-900">Attach bill</b>
            <button type="button" onClick={() => open(camRef)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-bold text-gray-900 hover:bg-gray-50">
              <Camera className="h-5 w-5 text-blue-600" aria-hidden /> Take photo
            </button>
            <button type="button" onClick={() => open(fileRef)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-bold text-gray-900 hover:bg-gray-50">
              <Upload className="h-5 w-5 text-blue-600" aria-hidden /> Upload from device
            </button>
            <button type="button" onClick={cancel} className="mt-1 w-full rounded-2xl bg-gray-100 py-3 text-[15px] font-bold text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
  const pick = (fn) => {
    pending.current = fn;
    warmReader();
    if (window.matchMedia(FILES_ONLY_QUERY).matches) fileRef.current?.click();
    else setAsking(true);
  };
  return [input, pick];
}

export const ChipButton = ({ busy, onClick, children }) => (
  <button
    type="button"
    disabled={busy}
    onClick={onClick}
    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-blue-300 bg-white px-3 text-[14px] font-bold text-blue-700 disabled:opacity-60 [&>svg]:text-green-600"
  >
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
    {children}
  </button>
);

export const BILL_NAME = { fuels: "Fuel bill", tolls: "Toll receipt", foods: "Food bill", stays: "Hotel bill" };
const ICON = { fuels: Fuel, tolls: Route, foods: UtensilsCrossed, stays: BedDouble };

/* A bill on the trip. Every bill here passed its checks when it was scanned
   (type, date, read) -- the amount is what was read off it, never typed. */
export function BillChip({ kind, bill, on, readOnly, onClick }) {
  const Icon = ICON[kind] || Route;
  const amt = Number(bill.billed ?? bill.amount) || 0;
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {inr(amt)}
      {bill.flag || bill.manual ? <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden /> : <Check className="h-3 w-3 text-green-700" aria-hidden />}
    </>
  );
  const cls = cn(
    "inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-bold",
    bill.flag || bill.manual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-800",
    on && "ring-2 ring-blue-500"
  );
  return readOnly ? (
    <span className={cls}>{inner}</span>
  ) : (
    <button type="button" className={cls} aria-pressed={on} onClick={onClick} aria-label={`${BILL_NAME[kind]} ${inr(amt)} — tap for details`}>
      {inner}
    </button>
  );
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}` : "");

/* What was read off a bill, and Remove (to replace it, remove it and scan
   again). */
export function BillEditor({ bill, kind, onRemove }) {
  if (!bill) return null;
  const nights = bill.nights || [];
  const billed = Number(bill.billed ?? bill.amount) || 0;
  const share = kind === "stays" && Number(bill.amount) && Number(bill.amount) !== billed;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px] text-gray-700">
      <div className="min-w-0 flex-1 leading-snug">
        <b className="text-gray-900">
          {BILL_NAME[kind]} · {inr(billed)}
        </b>
        {bill.vendor ? ` · ${bill.vendor}` : ""}
        <span className="block text-gray-500">
          {kind === "stays" && nights.length
            ? `${nights.length} night${nights.length > 1 ? "s" : ""} in this trip: ${nights.map(d).join(", ")}${share ? ` · counts ${inr(bill.amount)}` : ""}`
            : bill.date
              ? `dated ${d(bill.date)}`
              : ""}
        </span>
        {bill.manual && <span className="mt-1 block font-semibold text-amber-800">Entered by hand (the bill couldn&rsquo;t be read) — Accounts checks it against the photo after your officer approves.</span>}
        {bill.flag && <span className="mt-1 block font-semibold text-amber-800">{bill.flag} Your reporting officer will see this.</span>}
      </div>
      <button type="button" onClick={onRemove} className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 font-bold text-gray-600 hover:bg-white" aria-label="Remove bill">
        <X className="h-4 w-4" /> Remove
      </button>
    </div>
  );
}

/* ------------------------------ by hand ------------------------------ */

const KIND_SLOT = { Stay: "stays", Food: "foods", Fuel: "fuels", Toll: "tolls" };
const KIND_WORD = { Stay: "Stay (hotel)", Food: "Food", Fuel: "Fuel", Toll: "Toll" };

/* A bill the reader could not read (handwritten, faded, no bill no or date):
   instead of a refusal, the rep enters its type, date(s) and amount next to
   the photo, starting from whatever was read. The server checks the same
   trip rules on what is typed, stores the photo and fingerprints it; the line
   is marked "entered by hand" for a person to compare with the photo.
   onDone(slotKey, bill) adds it to the trip. */
export function ManualBill({ file, slot, trip, prefill, reason, onCancel, onDone }) {
  const kinds = MANUAL_KINDS[slot] || [];
  const p = prefill || {};
  const [kind, setKind] = useState(kinds.includes(p.kind) ? p.kind : kinds.length === 1 ? kinds[0] : null);
  const inTrip = (d) => (d && d >= trip.from && d <= trip.to ? d : "");
  const [date, setDate] = useState(inTrip(p.date));
  const [checkIn, setCheckIn] = useState(inTrip(p.checkIn) || inTrip(p.date) || "");
  const [checkOut, setCheckOut] = useState(p.checkOut && p.checkOut > (p.checkIn || "") ? p.checkOut : "");
  const [amount, setAmount] = useState(p.amount ? String(p.amount) : "");
  const [vendor, setVendor] = useState(p.vendor || "");
  // 12 Nov 2026: a handwritten bill needs the payment proof and a reason
  const [proof, setProof] = useState(null);
  const [proofUrl, setProofUrl] = useState(null);
  const [why, setWhy] = useState("");
  // paid in cash: no online payment, so no proof to add (13 Nov 2026)
  const [cash, setCash] = useState(false);
  const proofInput = useRef(null);
  useEffect(() => () => proofUrl && URL.revokeObjectURL(proofUrl), [proofUrl]);
  const pickProof = (f) => {
    if (!f) return;
    const bad = checkBillFile(f);
    if (bad) return setError(bad);
    setError("");
    setProof(f);
    setProofUrl(/^image\//.test(f.type) ? URL.createObjectURL(f) : null);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url] = useState(() => (file && /^image\//.test(file.type) ? URL.createObjectURL(file) : null));
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const stay = kind === "Stay";
  const nights = stay && checkIn && checkOut && checkOut > checkIn ? Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000) : 0;
  // 13 Nov 2026: the payment proof is required -- unless paid in cash; the reason always
  const ready = kind && Number(amount) > 0 && (stay ? checkIn && checkOut > checkIn : date) && why.trim().length >= 5 && (cash || !!proof);
  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await enterTripBill(file, slot, trip, { kind, date, checkIn, checkOut, amount: Number(amount), vendor, why: why.trim(), cash }, cash ? null : proof);
      if (!r.ok) return setError(r.reason);
      onDone(KIND_SLOT[r.bill.kind] || KIND_SLOT[kind], r.bill);
    } finally {
      setBusy(false);
    }
  };
  const input = "h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-[14px] font-semibold text-gray-900 outline-none focus:border-blue-500";
  const label = "flex flex-col gap-1 text-[12.5px] font-bold text-gray-600";
  return (
    // fixed inside the sheet (its panel is transformed): covers the sheet only
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-label="Enter the bill"
        className="flex max-h-[92%] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-start justify-between gap-2">
          <b className="text-[16px] font-extrabold text-gray-900">Enter the bill</b>
          <button type="button" aria-label="Cancel" disabled={busy} onClick={onCancel} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </span>
        <span className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold leading-snug text-amber-900">{reason}</span>
        {url ? (
          <img src={url} alt="The bill" className="max-h-[34vh] w-full rounded-xl border border-gray-200 bg-gray-50 object-contain" />
        ) : (
          <span className="rounded-xl bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">{file?.name || "bill"}</span>
        )}

        {kinds.length > 1 && (
          <div className={label}>
            What is this bill?
            <span role="radiogroup" aria-label="Bill type" className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
              {kinds.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("min-h-10 rounded-xl text-[13.5px] font-bold", kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>
                  {KIND_WORD[k]}
                </button>
              ))}
            </span>
          </div>
        )}

        {kind && stay && (
          <span className="grid grid-cols-2 gap-2">
            <label className={label}>
              Check-in
              <input type="date" className={input} min={trip.from} max={trip.to} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label className={label}>
              Check-out
              <input type="date" className={input} min={checkIn ? addDays(checkIn, 1) : trip.from} max={addDays(trip.to, 7)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
          </span>
        )}
        {kind && !stay && (
          <label className={label}>
            Bill date
            <input type="date" className={input} min={trip.from} max={trip.to} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {kind && (
          <label className={label}>
            Total on the bill{stay && nights ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}
            <span className="flex h-11 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 focus-within:border-blue-500">
              <span className="text-gray-400">₹</span>
              <input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent text-[15px] font-bold outline-none" aria-label="Total on the bill" />
            </span>
          </label>
        )}
        {kind && (
          <label className={label}>
            Hotel / shop name <span className="font-normal text-gray-400">optional</span>
            <input className={input} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={stay ? "e.g. Sri Lakshmi Lodge" : "e.g. Hotel Saravana"} />
          </label>
        )}

        {kind && (
          <div className={label}>
            Payment proof <span className="font-normal text-gray-400">{cash ? "not needed · paid in cash" : "required · GPay / UPI / bank screenshot of this payment"}</span>
            <input ref={proofInput} type="file" accept={BILL_ACCEPT} className="hidden" onChange={(e) => { pickProof(e.target.files?.[0]); e.target.value = ""; }} />
            {/* paid in cash: there is no online payment to show */}
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13.5px] font-bold text-gray-800">
              <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Paid in cash
              <span className="font-normal text-gray-500">— no online payment</span>
            </label>
            {cash ? null : proof ? (
              <span className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-2">
                {proofUrl ? (
                  <img src={proofUrl} alt="Payment proof" className="h-16 w-12 shrink-0 rounded-lg border border-gray-200 bg-white object-cover" />
                ) : (
                  <span className="grid h-16 w-12 shrink-0 place-items-center rounded-lg bg-white text-[10px] font-extrabold text-rose-700">PDF</span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-green-800">{proof.name || "payment proof"}</span>
                <button type="button" onClick={() => proofInput.current?.click()} className="rounded-lg px-2 py-1 text-[12.5px] font-bold text-blue-700">Change</button>
              </span>
            ) : (
              <button type="button" onClick={() => proofInput.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-blue-300 bg-blue-50 text-[13.5px] font-bold text-blue-700">
                <Upload className="h-4 w-4" aria-hidden /> Add payment proof
              </button>
            )}
            {!proof && !cash && <span className="text-[11.5px] font-semibold text-amber-700">Add it to save — or tick “Paid in cash” if it was paid in cash.</span>}
          </div>
        )}
        {kind && (
          <label className={label}>
            Why only a handwritten bill? <span className="font-normal text-gray-400">required</span>
            <textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Small mess near the hospital — they give only handwritten bills" className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-[14px] font-semibold text-gray-900 outline-none focus:border-blue-500" />
          </label>
        )}

        <span className="text-[11.5px] leading-snug text-gray-500">
          Your officer sees the photo, {cash ? "that it was paid in cash" : "the payment proof"} and your reason before approving.
        </span>
        {error && <span className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-800">{error}</span>}
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white text-[14px] font-bold text-gray-800">
            Cancel
          </button>
          <button type="button" disabled={busy || !ready} onClick={save} className="flex min-h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-500">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Add bill{Number(amount) > 0 ? ` · ${inr(Number(amount))}` : ""}
          </button>
        </span>
      </div>
    </div>
  );
}
