"use client";

/* The trip's bills as pictures, day by day (13 Nov 2026): under each day of
   the trip sheet, that day's stay / food / fuel / toll bills as small photos;
   tapping one opens it full screen (zoom, turn, the next / previous bill of
   the trip). The bill files are private ERP files, read through the app's own
   file route with the rep's token -- the same viewer as the approvals page. */

import { useMemo, useState } from "react";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { makeConn } from "../../../../../components/features/expense-claims/data/claimsApi";
import { FilePreview, billFile, useFileUrl } from "../../../../../components/features/expense-claims/ui";

const KINDS = [
  ["stays", "Stay"],
  ["foods", "Food"],
  ["fuels", "Fuel"],
  ["tolls", "Toll"],
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
          out.push({ url: b.proof, kind: "Payment proof", dates, billed: b.billed ?? b.amount, vendor: "", hand: false, proof: true, file: billFile(b.proof) });
        }
      }
    }
    return out.sort((a, b) => String(a.dates[0] || "").localeCompare(String(b.dates[0] || "")));
  }, [claim]);
  const files = useMemo(() => bills.map((b) => b.file), [bills]);
  const [open, setOpen] = useState(null);

  const strip = (date) => {
    if (!conn) return null;
    const mine = bills.filter((b) => b.dates.includes(date));
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
