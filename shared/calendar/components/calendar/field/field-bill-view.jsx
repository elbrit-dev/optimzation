"use client";

/* The trip's bills as pictures, day by day (13 Nov 2026): under each day of
   the trip sheet, that day's stay / food / fuel / toll bills as small photos;
   tapping one opens it full screen (zoom, turn, the next / previous bill of
   the trip). The bill files are private ERP files, read through the app's own
   file route with the rep's token -- the same viewer as the approvals page. */

import { useMemo, useState } from "react";
import { AlertTriangle, BedDouble, Fuel, Loader2, Maximize2, Route, TrainFront, Trash2, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { makeConn } from "../../../../../components/features/expense-claims/data/claimsApi";
import { FilePreview, billFile, useFileUrl } from "../../../../../components/features/expense-claims/ui";

const KINDS = [
  ["stays", "Stay"],
  ["foods", "Food"],
  ["fuels", "Fuel"],
  ["tolls", "Toll"],
  ["travels", "Travel"],
];
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

/* One bill, small: a tiny picture + what it is and its amount; tap to open. */
function BillChip({ conn, bill: b, onOpen }) {
  const img = b.file.kind === "image";
  const { status, url } = useFileUrl(img ? conn : null, img ? b.file : null);
  const label = b.proof ? "Paid proof" : b.dates.length > 1 ? `Stay · ${b.dates.length} nights` : b.kind;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${b.file.name}`}
      className={`flex items-center gap-1.5 rounded-lg border bg-white py-0.5 pl-0.5 pr-2 text-[11.5px] leading-tight text-gray-700 hover:bg-gray-50 ${b.hand ? "border-amber-400" : "border-gray-200"}`}
    >
      <span className="grid h-6 w-6 flex-none place-items-center overflow-hidden rounded-md bg-gray-100 text-[8px] font-bold text-gray-500">
        {img && status === "ready" ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : b.file.kind === "pdf" ? "PDF" : ""}
      </span>
      <span className="font-medium">{label}</span>
      {!b.proof && <span className="text-gray-500">{inr(b.billed)}{b.hand ? " ✍" : ""}</span>}
    </button>
  );
}

/* -> { strip(date): ReactNode | null, viewer: ReactNode | null } */
export function useTripBillViewer(claim) {
  const token = AUTH_CONFIG.authToken;
  const conn = useMemo(() => {
    if (!token) return null;
    try {
      return makeConn({ url: AUTH_CONFIG.erpUrl, token });
    } catch {
      return null;
    }
  }, [token]);
  // every bill of the trip once, in date order; each keeps one file object so
  // the viewer can step from one to the next
  const bills = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const [key, kind] of KINDS) {
      for (const b of (claim && claim[key]) || []) {
        if (!b?.url || seen.has(b.url)) continue;
        seen.add(b.url);
        const dates = kind === "Stay" && (b.nights || []).length ? b.nights : [b.date].filter(Boolean);
        out.push({ url: b.url, kind, dates, billed: b.billed ?? b.amount, vendor: b.vendor || "", hand: !!b.manual, file: billFile(b.url) });
        // a handwritten bill's payment screenshot sits right after it
        if (b.manual && b.proof && !seen.has(b.proof)) {
          seen.add(b.proof);
          out.push({ url: b.proof, kind: "Payment proof", of: kind, dates, billed: b.billed ?? b.amount, vendor: "", hand: false, proof: true, file: billFile(b.proof) });
        }
      }
    }
    return out.sort((a, b) => String(a.dates[0] || "").localeCompare(String(b.dates[0] || "")));
  }, [claim]);
  const files = useMemo(() => bills.map((b) => b.file), [bills]);
  const [open, setOpen] = useState(null);

  const strip = (date) => {
    if (!conn) return null;
    // stay / food bills are shown once, in the trip's DA bills (27 Nov 2026); fuel / toll / tickets stay on their day
    const mine = bills.filter((b) => b.dates.includes(date) && !["Stay", "Food"].includes(b.of || b.kind));
    if (!mine.length) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {mine.map((b) => (
          <BillChip key={b.url} conn={conn} bill={b} onOpen={() => setOpen(b.file)} />
        ))}
      </div>
    );
  };
  const viewer = open && conn ? <FilePreview conn={conn} file={open} files={files} onClose={() => setOpen(null)} /> : null;
  return { strip, viewer };
}

/* ------------------- DA bills as pictures (27 Nov 2026) -------------------
   The user: under "DA bills · stay & food", the bills uploaded as pictures;
   a tap opens the bill -- the photo, what was read off it -- and Remove is
   there. Replaces the small amount chips + the details strip. */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dd = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}` : "");
const TILE_NAME = { stays: "Hotel", foods: "Food", travels: "Ticket", fuels: "Fuel", tolls: "Toll" };
const TILE_ICON = { stays: BedDouble, foods: UtensilsCrossed, travels: TrainFront, fuels: Fuel, tolls: Route };

export function useBillConn() {
  const token = AUTH_CONFIG.authToken;
  return useMemo(() => {
    if (!token) return null;
    try {
      return makeConn({ url: AUTH_CONFIG.erpUrl, token });
    } catch {
      return null;
    }
  }, [token]);
}

const billWhen = (kind, b) => {
  const ns = b.nights || [];
  if (kind === "stays" && ns.length) return ns.length > 1 ? `${dd(ns[0])} – ${dd(ns[ns.length - 1])} · ${ns.length} nights` : `${dd(ns[0])} · 1 night`;
  return dd(b.date);
};

/* One bill as a small picture card: photo, amount, what and when. */
function BillTile({ conn, kind, bill: b, onOpen }) {
  const file = b.url ? billFile(b.url) : null;
  const img = file?.kind === "image";
  const { status, url } = useFileUrl(img ? conn : null, img ? file : null);
  const Icon = TILE_ICON[kind] || Route;
  const warn = !!(b.flag || b.manual);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${TILE_NAME[kind] || "Bill"} ${inr(b.billed ?? b.amount)} — open`}
      className={cn("flex w-[104px] flex-none flex-col overflow-hidden rounded-xl border bg-white text-left active:scale-[.98]", warn ? "border-amber-300" : "border-gray-200")}
    >
      <span className="relative grid h-[84px] w-full place-items-center overflow-hidden bg-gray-100 text-gray-400">
        {img && status === "ready" ? (
          <img src={url} alt="" className="h-full w-full object-cover object-top" />
        ) : img && status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : file?.kind === "pdf" ? (
          <b className="text-[12px] text-red-700">PDF</b>
        ) : (
          <Icon className="h-6 w-6" aria-hidden />
        )}
        <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md bg-white/90 text-gray-700 shadow-sm">
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        {warn && (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md bg-amber-100 text-amber-700">
            <AlertTriangle className="h-3 w-3" aria-hidden />
          </span>
        )}
      </span>
      <span className="flex flex-col px-2 py-1.5">
        <b className="text-[13px] font-extrabold leading-tight text-gray-900">{inr(b.billed ?? b.amount)}</b>
        <span className="truncate text-[11px] leading-tight text-gray-500">{billWhen(kind, b)}</span>
      </span>
    </button>
  );
}

/* The bill opened: its picture, what was read, and Remove. */
function BillOpen({ conn, kind, bill: b, editable, busy, onRemove, onFull, onClose }) {
  const file = b.url ? billFile(b.url) : null;
  const img = file?.kind === "image";
  const { status, url } = useFileUrl(img ? conn : null, img ? file : null);
  const [sure, setSure] = useState(false);
  const billed = Number(b.billed ?? b.amount) || 0;
  const counts = kind === "stays" && Number(b.amount) && Number(b.amount) !== billed ? Number(b.amount) : null;
  return (
    // fixed inside the sheet (its panel is transformed): covers the sheet only
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={onClose}>
      <div role="dialog" aria-label="Bill" className="flex max-h-[92%] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <b className="block text-[16px] font-extrabold text-gray-900">
              {TILE_NAME[kind] || "Bill"} · {inr(billed)}
            </b>
            <span className="block truncate text-[12.5px] text-gray-500">{[b.vendor, billWhen(kind, b)].filter(Boolean).join(" · ")}</span>
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </span>
        <button type="button" disabled={!file} onClick={onFull} className="relative grid min-h-[160px] place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50" aria-label="Open the bill full screen">
          {img && status === "ready" ? (
            <img src={url} alt="The bill" className="max-h-[42vh] w-full object-contain" />
          ) : img && status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
          ) : file?.kind === "pdf" ? (
            <b className="text-[14px] text-red-700">PDF · tap to open</b>
          ) : (
            <span className="text-[12.5px] text-gray-500">No picture</span>
          )}
          {file && (
            <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </button>
        {(counts || b.manual || b.flag) && (
          <div className="flex flex-col gap-1 text-[12.5px] leading-snug">
            {counts ? <span className="text-gray-600">This trip counts {inr(counts)} of it (its nights here); removing it takes it off every trip not yet sent.</span> : null}
            {b.manual && <span className="font-semibold text-amber-800">Entered by hand — Accounts checks it against the photo.</span>}
            {b.flag && <span className="font-semibold text-amber-800">{b.flag} Your reporting officer will see this.</span>}
          </div>
        )}
        {editable &&
          (sure ? (
            <span className="flex gap-2">
              <button type="button" onClick={() => setSure(false)} className="h-11 flex-1 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-700">
                Keep
              </button>
              <button type="button" disabled={busy} onClick={onRemove} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-[14px] font-bold text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove bill
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setSure(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 text-[14px] font-bold text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </button>
          ))}
      </div>
    </div>
  );
}

/* The trip's bills of the given kinds as picture cards; tap -> the bill, Remove there.
   onRemove(kind, id) -> Promise */
export function BillTiles({ claim, kinds, editable, onRemove }) {
  const conn = useBillConn();
  const list = kinds.flatMap((kind) => (claim[kind] || []).map((bill) => ({ kind, bill })));
  const files = useMemo(() => list.map((x) => (x.bill.url ? billFile(x.bill.url) : null)).filter(Boolean), [claim, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(null); // bill id
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);
  const cur = list.find((x) => x.bill.id === open) || null;
  if (!list.length) return null;
  return (
    <>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
        {list.map(({ kind, bill }) => (
          <BillTile key={bill.id} conn={conn} kind={kind} bill={bill} onOpen={() => setOpen(bill.id)} />
        ))}
      </div>
      {cur && (
        <BillOpen
          conn={conn}
          kind={cur.kind}
          bill={cur.bill}
          editable={editable}
          busy={busy}
          onClose={() => setOpen(null)}
          onFull={() => setFull(files.find((f) => f.url === cur.bill.url) || billFile(cur.bill.url))}
          onRemove={async () => {
            setBusy(true);
            try {
              await onRemove(cur.kind, cur.bill.id);
              setOpen(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {full && conn ? <FilePreview conn={conn} file={full} files={files} onClose={() => setFull(null)} /> : null}
    </>
  );
}
