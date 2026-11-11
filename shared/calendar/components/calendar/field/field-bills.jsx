"use client";

/* Bills attached in the Field layer: the Take photo / Upload chooser, the
   dashed "scan …" chip, an attached bill's chip, and its amount editor.
   Shared by the trip sheet (fuel, toll, stay, food) and the car request. */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Fuel, Loader2, Route, Upload, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { inr } from "@calendar/lib/field-expenses/field-days";
import { BILL_ACCEPT, checkBillFile, readBill, warmReader } from "@calendar/lib/field-expenses/bill-reader";

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

export function BillChip({ kind, bill, on, readOnly, onClick }) {
  const Icon = kind === "fuels" ? Fuel : kind === "foods" ? UtensilsCrossed : Route;
  const amt = Number(bill.amount) || 0;
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {amt ? inr(amt) : "₹ —"}
      {bill.file ? <Check className="h-3 w-3 text-green-700" aria-hidden /> : <Camera className="h-3 w-3 text-gray-400" aria-hidden />}
    </>
  );
  const cls = cn(
    "inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-bold",
    bill.file ? "border-gray-200 bg-white text-gray-800" : "border-amber-300 bg-amber-50 text-amber-800",
    on && "ring-2 ring-blue-500"
  );
  return readOnly ? (
    <span className={cls}>{inner}</span>
  ) : (
    <button type="button" className={cls} aria-pressed={on} onClick={onClick} aria-label={`${BILL_NAME[kind]} ${inr(amt)} — tap to edit`}>
      {inner}
    </button>
  );
}

export function BillEditor({ bill, kind, onAmount, onPhoto, onRemove }) {
  const [v, setV] = useState(bill?.amount ?? "");
  if (!bill) return null;
  return (
    <div className="mt-2 flex items-center gap-2 pl-9">
      <label className="flex h-10 flex-1 items-center gap-1 rounded-xl border border-gray-300 px-2 text-sm">
        <span className="text-gray-400">₹</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={v}
          placeholder={`${BILL_NAME[kind]} amount`}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onAmount(v === "" ? null : Math.max(0, Math.round(Number(v))))}
          className="w-full bg-transparent outline-none"
          aria-label="Amount"
        />
      </label>
      <button
        type="button"
        onClick={onPhoto}
        className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", bill.file ? "border-green-200 bg-green-50 text-green-700" : "border-gray-300 text-gray-600")}
        aria-label={bill.file ? "Photo attached — replace" : "Attach photo"}
      >
        {bill.file ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
      </button>
      <button type="button" onClick={onRemove} className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500" aria-label="Remove bill">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* Fuel and toll bills on a car request: scan or upload, the amount read off
   the bill, tap a chip to fix it or remove it. `value` is { fuels, tolls };
   `onChange` gets the next value (or an updater). Only the file's name and
   size are kept, with the amount. */
export function CarBills({ value, onChange, readOnly = false }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [billInput, pickBill] = useBillPicker();
  const meta = (file) => (file ? { name: file.name, size: file.size } : null);
  const update = (fn) => onChange((cur) => fn(cur || value));
  const put = (kind, id, patch) => update((b) => ({ ...b, [kind]: b[kind].map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const scan = (kind) =>
    pickBill(async (file) => {
      setBusy(kind);
      try {
        const read = await readBill(file, BILL_NAME[kind]);
        const id = `${kind}-${Date.now().toString(36)}`;
        update((b) => ({ ...b, [kind]: [...b[kind], { id, amount: read?.amount ?? null, file: meta(file) }] }));
        setEditing({ kind, id });
        toast[read ? "success" : "message"](read ? `Read ${inr(read.amount)} off the bill` : "Couldn't read the amount — type it in");
      } catch (e) {
        toast.error(e?.message || String(e));
      } finally {
        setBusy(null);
      }
    });
  const bill = editing ? value[editing.kind].find((b) => b.id === editing.id) : null;
  const total = [...value.fuels, ...value.tolls].reduce((s, b) => s + (Number(b.amount) || 0), 0);

  return (
    <div>
      {billInput}
      <span className="flex items-center justify-between text-[13px] font-bold text-gray-700">
        Bills · fuel &amp; toll
        {total > 0 && <b className="text-[13px] font-extrabold text-gray-900">{inr(total)}</b>}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {["fuels", "tolls"].flatMap((kind) =>
          value[kind].map((b) => (
            <BillChip key={b.id} kind={kind} bill={b} readOnly={readOnly} on={editing?.id === b.id} onClick={() => setEditing(editing?.id === b.id ? null : { kind, id: b.id })} />
          ))
        )}
        {!readOnly && (
          <>
            <ChipButton busy={busy === "fuels"} onClick={() => scan("fuels")}>
              <Camera className="h-4 w-4" aria-hidden /> scan fuel
            </ChipButton>
            <ChipButton busy={busy === "tolls"} onClick={() => scan("tolls")}>
              <Camera className="h-4 w-4" aria-hidden /> scan toll
            </ChipButton>
          </>
        )}
      </div>
      {!readOnly && bill && (
        <BillEditor
          key={bill.id}
          bill={bill}
          kind={editing.kind}
          onAmount={(amount) => put(editing.kind, editing.id, { amount })}
          onPhoto={() => pickBill((file) => put(editing.kind, editing.id, { file: meta(file) }))}
          onRemove={() => {
            update((b) => ({ ...b, [editing.kind]: b[editing.kind].filter((x) => x.id !== editing.id) }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
