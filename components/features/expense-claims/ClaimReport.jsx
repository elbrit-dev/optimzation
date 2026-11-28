"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Router from "next/router";
import { Dialog } from "@/design-system";
import { useClaims } from "./data/useClaims";
import { CASH_REQUESTS, cashAdvancesOf, checkSettlementBills, fetchMySettlements, fetchSettlementSettings, listBillHelp, removeSettlementBill, sendBillsForApproval } from "./data/claimsApi";
import { AskHelpSheet, HelpRequestsSheet, askHighlight, helpHighlight } from "./helpRequests";
import { ChainTrack, MyRequestSheet, MyRequests, SendBar, serviceHeld, typeLine, waitingOn } from "./settlement";
import { CSS, FONT_HREF, Highlights, IC, Icon, Note, Rail, Sheet, Spinner, billFile, btn, card, ell, tabNum, useFileUrl } from "./ui";
import { BillSheet, CashSheet } from "./sheets";
import { BILL_STATE, MON, WD, billState, dateOf, inr, ledger, monthKey, monthLabel, shortDate, weeksOf } from "./model";

/* Expense claims -- the claims prototype's Settlements screen, in the app's
 * theme, on the settlement model (Miscellaneous, 27 Oct 2026):
 *
 *   Cash card     what is in hand -- what is left of the cash Accounts paid
 *                 (Employee Advance) less the verified bills since -- or, below
 *                 zero, what is owed to the person, as Paid to you -> Verified
 *                 bills -> In hand / Owed, plus bills still being checked and
 *                 cash asked for. "Scan a bill" ("Request cash" only while
 *                 CASH_REQUESTS is on -- off for now). Verified is
 *                 final for now: nothing is booked (no Accounts Payable) --
 *                 Accounts settle what is owed later.
 *   Highlights    the month: verified, cash paid, bills, AI-verified share.
 *   Bills & cash  the month's bills and cash, newest first by week. Each bill
 *                 shows its own status (Checking / Verified / Accounts
 *                 checking / Rejected) and opens its detail.
 *
 * A bill counts once it is Verified: the AI check at once (90+), or Accounts.
 * The next cash payment settles the open bills -- they come out of it first.
 *
 * Reads the ERP as the signed-in user (url + token). The month pill steps
 * back through months with bills or cash. ?new=1 (or newClaim) opens "Add a
 * bill". Claims of the old flow are under "All past claims". */

function useWidth(ref) {
  const [w, setW] = useState(1024);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function go(to) {
  if (!to) return;
  const hard = () => { if (typeof window !== "undefined") window.location.assign(to); };
  try { Router.push(to)?.catch?.(hard); } catch { hard(); }
}

const kicker = { display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576" };
const ADV = "#7c3aed";
const link = { display: "flex", alignItems: "center", gap: 5, height: 36, padding: "0 8px", borderRadius: 8, border: 0, background: "transparent", color: "#2563eb", fontSize: 13.5, fontWeight: 600, cursor: "pointer" };

/* One step of the money flow: Paid to you > Verified bills > In hand. */
function Step({ k, v, color, soft, dashed, small }) {
  return (
    <span style={{ flex: "1 0 auto", minWidth: 86, display: "flex", flexDirection: "column", gap: 2, padding: "10px 11px 9px", borderRadius: 14, background: soft || "#f4f5f7", boxShadow: dashed ? "inset 0 0 0 1.5px #fedf89" : "none" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: dashed ? "#b54708" : "#667085" }}>{k}</span>
      <b style={{ fontSize: 15, fontWeight: 700, color: color || "#0b1220", whiteSpace: "nowrap", ...tabNum }}>{v}</b>
      {small && <span style={{ fontSize: 10, fontWeight: 700, color: "#b54708" }}>{small}</span>}
    </span>
  );
}
const arrow = (k) => <span key={k} aria-hidden style={{ alignSelf: "center", color: "#c0c5cf", display: "flex", flex: "none" }}><Icon d={IC.next} size={14} /></span>;

/* One line of the ledger: a bill (−), cash paid (+), cash asked for, or a pay-back. */
function Entry({ e, held, req, onOpen }) {
  const dt = dateOf(e.date);
  const day = (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, gap: 3 }}>
      <span style={{ fontSize: 17, fontWeight: 700, ...tabNum }}>{dt.getDate()}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#8a93a3", textTransform: "uppercase" }}>{WD[dt.getDay()]}</span>
    </span>
  );
  const rowStyle = { width: "100%", display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 4px", border: 0, borderTop: "1px solid #eef1f5", borderRadius: 10, background: "transparent", textAlign: "left" };
  const after = e.bal < 0 ? `owed ${inr(-e.bal)}` : `${inr(e.bal)} in hand`;
  if (e.kind !== "bill") {
    const req = e.kind === "request";
    // the CEO's approval submits the advance: approved, Accounts still to pay it
    const approved = req && e.adv?.docstatus === 1;
    const title = req ? "Advance requested" : e.kind === "payout" ? "Paid back by Accounts" : "Cash from Accounts";
    return (
      <div style={{ ...rowStyle, opacity: req ? 0.85 : 1 }}>
        {day}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600, ...ell }}>{title}</span>
          <span style={{ display: "block", fontSize: 12, color: "#5b6576", ...ell }}>{e.note}{req ? (approved ? " · approved — to be paid" : " · with your managers") : ""}</span>
        </span>
        <span style={{ textAlign: "right" }}>
          <b style={{ display: "block", fontSize: 15, color: req ? "#b54708" : "#067647", whiteSpace: "nowrap", ...tabNum }}>+ {inr(e.amount)}</b>
          <span style={{ fontSize: 11, color: "#8a93a3", whiteSpace: "nowrap" }}>{req ? (approved ? "to be paid" : "paid once approved") : after}</span>
        </span>
      </div>
    );
  }
  const st = billState(e.claim, e.line);
  const counted = e.state === "Verified";
  // 26 Nov 2026 (the user): the request sits on its bill -- its chain right
  // here, and in words WHO has it now; a bill sent back is "Not a valid bill"
  const back = e.state === "Rejected" || (e.line?.state === "Checked" && !!e.line.review);
  const waiting = req?.status === "waiting";
  const who = waiting && !held ? (waitingOn(req) || "").replace(/^with/, "With") : "";
  const status = back ? { tone: "#b42318", icon: "x", text: "Not a valid bill", where: e.line.review || "" }
    : held ? { tone: "#b54708", icon: "hist", text: "Waiting on doctor service", where: "" }
    : who ? { tone: "#b54708", icon: "hist", text: who, where: "" }
    : e.state === "Checking" || e.state === "Checked" ? { tone: "#0e7490", icon: "check", text: "Not sent", where: "" }
    : st;
  const side = counted ? after : back ? "not valid" : e.state === "Checking" || e.state === "Checked" ? "not sent" : "pending";
  return (
    <button type="button" className="ec-ghost" onClick={onOpen} style={{ ...rowStyle, cursor: "pointer" }}>
      {day}
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600, ...ell }}>{e.line.note || e.line.type}</span>
        {/* the settlement type (23 Nov 2026): Own · kind, or the doctor */}
        {e.claim.settlement && <span style={{ display: "block", fontSize: 12, color: "#5b6576", ...ell }}>{typeLine(e.line)}</span>}
        {/* 26 Nov 2026 (the user): the chain below already shows who has it -- no "With X" line */}
        {!(who && req.steps?.length > 0) && (
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: status.tone, minWidth: 0 }}>
          <span style={{ flex: "none", display: "flex" }}><Icon d={IC[status.icon]} size={12} /></span><span style={{ minWidth: 0, ...ell }}>{status.text}{status.where ? <span style={{ color: "#8a93a3", fontWeight: 500 }}> · {status.where}</span> : null}</span>
        </span>
        )}
        {req && req.steps?.length > 0 && !back && <span style={{ marginTop: 2 }}><ChainTrack r={req} compact /></span>}
      </span>
      <span style={{ textAlign: "right" }}>
        <b style={{ display: "block", fontSize: 15, whiteSpace: "nowrap", color: back ? "#98a2b3" : "#0b1220", textDecoration: back ? "line-through" : "none", ...tabNum }}>− {inr(e.amount)}</b>
        <span style={{ fontSize: 11, whiteSpace: "nowrap", color: back ? "#b42318" : counted && e.bal < 0 ? "#b42318" : "#8a93a3" }}>{side}</span>
      </span>
    </button>
  );
}

/* A bill's journey, step by step: added -> sent for approval up the chain
   -> verified by the CEO's approval -> settlement. The rep never sees the
   bill's score (16 Nov 2026): only the approvers do. Each step is done, now
   (where the bill is), failed, or still to come. */
function trackOf(e) {
  const l = e.line, s = e.state || "Checking";
  // a settlement bill is its own record (Settlement Expense, 23 Nov 2026)
  const steps = [{ k: "Bill added", v: e.claim.settlement ? "Saved" : `Saved on ${e.claim.id}`, at: "done" }];
  // 16 Nov 2026: a checked bill goes up the approval chain to the CEO
  if (s === "Checking") steps.push({ k: "Approval", v: "Not sent yet", at: "now" });
  else if (s === "Checked" && l.review) steps.push({ k: "Sent back", v: "Fix or send again", note: l.review, at: "fail" });
  else if (s === "Checked") steps.push({ k: "Approval", v: "Not sent yet", at: "now" });
  else if (s === "In Approval" && e.held) steps.push({ k: "Approval", v: "Waiting on doctor service", at: "now" });
  // who has it now, by name (26 Nov 2026) -- "with your managers" said nothing
  else if (s === "In Approval") steps.push({ k: "Approval", v: (e.req && waitingOn(e.req) ? waitingOn(e.req).replace(/^with/, "With") : "") || (l.settleType && l.settleType !== "Own" ? "With your manager" : "With your managers"), at: "now" });
  else if (s === "In Review") steps.push({ k: "In review", v: "Accounts checking", at: "now" });
  // a settlement bill rejected by an approver (28 Nov 2026): final -- add it again as a new bill
  else if (s === "Rejected" && e.claim.settlement) steps.push({ k: "Approval", v: "Rejected · add again as a new bill", note: l.review, at: "fail" });
  else if (s === "Rejected") steps.push({ k: "Reviewed by Accounts", v: "Not accepted", note: l.review, at: "fail" });
  else if (s === "Verified") steps.push({ k: "Approved", v: "Paid next run", at: "done" });
  if (s !== "Rejected") {
    steps.push({ k: "Verified", v: s === "Verified" ? "Counts" : "After approval", at: s === "Verified" ? "done" : "next" });
    const settled = e.claim.settlement ? !!l.paid : e.claim.docstatus === 1;
    // a booked settlement bill: what the cash advance covered, and what Accounts pay
    // still to be paid: what the advance did not cover, less what Accounts paid
    // already (no payment date is known -- a part payment says only that)
    const due = Math.max(0, (l.payable || 0) - (l.paidAmount || 0));
    const from = l.fromAdvance > 0 ? `${inr(l.fromAdvance)} from advance · ` : "";
    const how = e.claim.settlement && l.booked
      ? l.paid
        ? l.fromAdvance > 0 && l.payable > 0 ? `${inr(l.fromAdvance)} advance · ${inr(l.payable)} to bank` : l.payable > 0 ? `Paid to bank` : `From advance`
        : l.paidAmount > 0 ? `${from}${inr(due)} still due`
          : l.fromAdvance > 0 ? `${from}${inr(due)} due` : "Paid next run"
      : null;
    steps.push({ k: "Settlement", v: how || (settled ? "Settled" : s === "Verified" ? "Settled later" : "After approval"), at: settled ? "done" : s === "Verified" ? "now" : "next" });
  }
  return steps;
}

const TRACK = { done: ["#067647", IC.check], now: ["#2563eb", null], flag: ["#b54708", IC.eye], fail: ["#b42318", IC.x], next: ["#c0c5cf", null] };
function Track({ steps }) {
  return (
    <ol aria-label="Bill status" style={{ ...card, listStyle: "none", margin: 0, padding: "14px 16px 4px" }}>
      {steps.map((s, i) => {
        const [c, ic] = TRACK[s.at];
        const last = i === steps.length - 1;
        return (
          <li key={s.k} aria-current={s.at === "now" ? "step" : undefined} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", columnGap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 22, height: 22, borderRadius: 99, flex: "none", display: "grid", placeItems: "center", color: "#fff", background: s.at === "next" ? "#fff" : s.at === "now" ? "#fff" : c, boxShadow: s.at === "next" ? `inset 0 0 0 2px ${c}` : s.at === "now" ? `inset 0 0 0 2px ${c}, 0 0 0 4px color-mix(in srgb,${c} 18%,transparent)` : "none" }}>
                {ic ? <Icon d={ic} size={12} sw={2.6} /> : s.at === "now" ? <span style={{ width: 8, height: 8, borderRadius: 99, background: c }} /> : null}
              </span>
              {!last && <span style={{ flex: 1, width: 2, minHeight: 14, margin: "3px 0", borderRadius: 2, background: s.at === "next" ? "#e4e7ec" : `color-mix(in srgb,${c} 45%,#e4e7ec)` }} />}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: last ? 10 : 14, minWidth: 0 }}>
              <b style={{ fontSize: 14, lineHeight: "22px", color: s.at === "next" ? "#8a93a3" : "#0b1220" }}>{s.k}</b>
              <span style={{ fontSize: 13, color: s.at === "next" ? "#98a2b3" : s.at === "fail" ? "#b42318" : "#475467", lineHeight: 1.4 }}>{s.v}</span>
              {s.note && <span style={{ fontSize: 12.5, color: "#5b6576", lineHeight: 1.45, padding: "7px 10px", marginTop: 4, borderRadius: 10, background: "#f7f8fa" }}>{s.note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* The bill's photo (or PDF) in a popup over the page -- never a new tab. A
   nested dialog, so it sits above the bill's own popup (Esc / back / the X
   close it alone) on a solid dark backdrop. */
function BillViewer({ src, pdf, error, onClose }) {
  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }} backName="expense-claims-bill">
      <Dialog.Portal>
        {/* forceRender: Base UI leaves a nested dialog's backdrop out by default. */}
        <Dialog.Backdrop forceRender style={{ background: "rgba(8,11,18,.94)", backdropFilter: "blur(4px)", opacity: 1 }} />
        <Dialog.Viewport>
          <Dialog.Popup aria-label="The bill" style={{ inlineSize: "100vw", blockSize: "100dvh", maxInlineSize: "none", maxBlockSize: "none", margin: 0, padding: "56px 16px 16px", borderRadius: 0, background: "rgba(8,11,18,.94)", boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Dialog.Close aria-label="Close" style={{ ...btn.icon, position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.16)", color: "#fff", borderRadius: 99 }}><Icon d={IC.x} size={20} /></Dialog.Close>
            {/* opens at once: the photo is already loading (or loaded) since the bill opened */}
            {error ? <Note>{error}</Note>
              : !src ? <Spinner size={28} />
              : pdf
                ? <iframe title="The bill" src={src} style={{ width: "min(900px,100%)", height: "100%", border: 0, borderRadius: 12, background: "#fff" }} />
                : <img src={src} alt="The bill" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, boxShadow: "0 20px 50px -20px rgba(0,0,0,.7)" }} />}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* A bill, opened: its amount, where it is in its journey, what the bill
   says against what was entered, and the photo. */
/* A bill not sent (or sent back, or taken back): the rep may still remove it
   (settlement_api remove_bill: Checking / Checked, not in a request). */
const removable = (e) => !!e?.claim?.settlement && (e.state === "Checking" || e.state === "Checked") && !e.line?.settlement;

/* Remove, asked twice: the first tap asks, the second removes. */
function RemoveBill({ busy, onRemove, compact }) {
  const [ask, setAsk] = useState(false);
  const h = 44;
  if (!ask) {
    return (
      <button type="button" className="ec-ghost" disabled={busy} onClick={() => setAsk(true)}
        style={{ ...btn.ghost, height: h, minWidth: 44, borderRadius: 12, color: "#b42318", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...(compact ? { padding: "0 12px" } : null) }}>
        <Icon d={IC.trash} size={15} />Remove
      </button>
    );
  }
  return (
    <span role="group" aria-label="Remove this bill?" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#b42318" }}>Remove this bill and its photo?</span>
      <button type="button" className="ec-ghost" disabled={busy} onClick={() => setAsk(false)} style={{ ...btn.ghost, height: h, borderRadius: 12, padding: "0 12px" }}>Keep it</button>
      <button type="button" className="ec-cta" disabled={busy} onClick={onRemove} style={{ ...btn.primary, height: h, borderRadius: 12, padding: "0 14px", display: "flex", alignItems: "center", gap: 6 }}>
        {busy ? <Spinner size={14} /> : <Icon d={IC.trash} size={15} />}Remove
      </button>
    </span>
  );
}

function BillDetail({ conn, e, onClose, busy, onRemove, onResend }) {
  const l = e.line;
  const st = BILL_STATE[e.state] || BILL_STATE.Checking;
  const steps = trackOf(e);
  // 26 Nov 2026 (the user: "the preview needs to be instant"): the photo is
  // fetched the moment the bill opens (into the shared cache), so View shows it
  // at once -- before, it was fetched only on the tap
  const bf = useMemo(() => billFile(l.bill), [l.bill]);
  const photo = useFileUrl(l.bill ? conn : null, bf);
  const [shown, setShown] = useState(false);
  const view = () => setShown(true);
  const row = (k, v) => v ? <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", fontSize: 14, borderTop: "1px solid #eef1f5" }}><span style={{ color: "#5b6576" }}>{k}</span><b style={{ textAlign: "right", ...tabNum }}>{v}</b></div> : null;
  return (
    <Sheet title={l.note || "Bill"} sub={e.claim.settlement ? shortDate(l.date) : `${shortDate(l.date)} · ${e.claim.id}`} onClose={onClose} desktop="dialog" maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", ...tabNum }}>{inr(l.amount)}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, flex: "none", padding: "4px 10px", borderRadius: 99, fontSize: 12.5, fontWeight: 700, color: st.tone, background: `color-mix(in srgb,${st.tone} 10%,#fff)` }}><Icon d={IC[st.icon]} size={13} />{st.text}</span>
        </div>
        {e.held && <Note tone="info" style={{ color: "#b54708", background: "#fffaeb" }}>Waiting on doctor service</Note>}
        <Track steps={steps} />
        <div style={{ ...card, padding: "0 14px" }}>
          {e.claim.settlement && row("For", typeLine(l))}
          {row("On the bill", [l.ai?.amount ? inr(l.ai.amount) : null, l.ai?.date ? shortDate(l.ai.date) : null, l.ai?.vendor].filter(Boolean).join(" · ") || null)}
          {row("You entered", `${inr(l.amount)} · ${shortDate(l.date)}`)}
        </div>
        {l.bill && (
          <button type="button" className="ec-ghost" onClick={view} style={{ ...btn.ghost, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon d={IC.eye} size={16} />View the bill
          </button>
        )}
        {removable(e) && (onRemove || onResend) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* sent back: it goes again only when the rep says so */}
            {l.review && onResend && (
              <button type="button" className="ec-cta" disabled={busy} onClick={onResend} style={{ ...btn.primary, flex: 1, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {busy ? <Spinner size={14} /> : <Icon d={IC.arrow} size={16} />}Send again
              </button>
            )}
            {onRemove && <RemoveBill busy={busy} onRemove={onRemove} />}
          </div>
        )}
      </div>
      {shown && <BillViewer src={photo.status === "ready" ? photo.url : null} pdf={bf?.kind === "pdf"} error={photo.status === "error" ? photo.error : ""} onClose={() => setShown(false)} />}
    </Sheet>
  );
}

export default function ClaimReport({
  url, token, employee, asOf, viewport = "auto", newClaim = false,
  homePath = "/", historyPath = "/my-profile?tab=claims", onBack, onOpenHistory, className,
}) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const isDesk = viewport === "desktop" || (viewport === "auto" && w >= 768);
  // Wide desktop: cash on the left (stays in view), bills & cash on the right.
  const wide = isDesk && (viewport === "desktop" || w >= 1024);
  const today = useMemo(() => { const d = asOf ? new Date(asOf) : new Date(); return isNaN(d) ? new Date() : d; }, [asOf]);
  const cur = monthKey(today);

  const data = useClaims({ url, token, employee });
  const { conn, me, claims = [], advances = [] } = data;

  // settlement approval (16 Nov 2026): the requests and the chain they go up
  const [settle, setSettle] = useState({ requests: [], chain: [], loaded: false, error: "" });
  const [sending, setSending] = useState(false);
  const [settleTick, setSettleTick] = useState(0);
  useEffect(() => {
    if (!conn) return undefined;
    let alive = true;
    fetchMySettlements(conn)
      .then((x) => alive && setSettle({ ...x, loaded: true, error: "" }))
      .catch((e) => { console.warn("[expense-claims] requests unreadable:", e.message); if (alive) setSettle((s) => ({ ...s, error: e.message || "unreadable" })); });
    return () => { alive = false; };
  }, [conn, claims, settleTick]);
  // the rep's help requests (24 Nov 2026): a card in the Highlights opens them.
  // Unreadable (the ERP script older than 24 Nov) -> no card, never an error.
  const [help, setHelp] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);
  // the general Help card's form, and the request the sheet opens on after it
  const [askOpen, setAskOpen] = useState(false);
  const [helpFocus, setHelpFocus] = useState(null);
  const [helpTick, setHelpTick] = useState(0);
  const loadHelp = () => listBillHelp(conn).then(setHelp).catch((e) => console.warn("[expense-claims] help requests unreadable:", e.message));
  useEffect(() => { if (conn) loadHelp(); }, [conn, helpTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // only the advances of the rep's own Cash requests count (null until known: all)
  const cashAdv =useMemo(() => (settle.loaded ? cashAdvancesOf(settle.requests) : null), [settle]);
  // a bill's request, to tell whether it waits for its doctor service
  const reqById = useMemo(() => new Map(settle.requests.map((r) => [r.id, r])), [settle]);
  const heldOf = (l) => !!l?.settlement && serviceHeld(reqById.get(l.settlement));
  // 23 Nov 2026: cash up front is only for RBM and above (Settlement Settings);
  // unreadable settings never offer it
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    if (!conn) return undefined;
    let alive = true;
    fetchSettlementSettings(conn).then((x) => alive && setSettings(x));
    return () => { alive = false; };
  }, [conn]);
  const canCash = CASH_REQUESTS && !!settings?.canRequestCash;

  const L = useMemo(() => ledger(claims, advances, cashAdv), [claims, advances, cashAdv]);
  // Settlement open for a date window (25 Nov 2026: October alone): the page opens on that month
  const winMonth = settings?.billsTo ? settings.billsTo.slice(0, 7) : null;
  const months = useMemo(() => {
    const set = new Set([cur]);
    if (winMonth && winMonth <= cur) set.add(winMonth);
    for (const e of L.entries) if (e.date && e.date.slice(0, 7) <= cur) set.add(e.date.slice(0, 7));
    return [...set].sort();
  }, [L, cur, winMonth]);
  const [month, setMonth] = useState(cur);
  const winShown = useRef(false);
  useEffect(() => {
    if (winMonth && !winShown.current && winMonth <= cur) {
      winShown.current = true;
      setMonth(winMonth);
    }
  }, [winMonth, cur]);
  const mi = months.indexOf(month);

  // every added bill not sent yet (a "Checking" one is scored as it goes)
  const unsent = (L.open?.lines || []).filter((l) => l.bill && (!l.state || l.state === "Checking" || l.state === "Checked") && !l.settlement);
  // a sent-back bill goes again only when the rep says so ("Send again" on it);
  // the send bar sends the others
  const fresh = unsent.filter((l) => !l.review);
  const sentBack = unsent.filter((l) => l.review);
  const [acting, setActing] = useState(""); // the bill being removed / sent again

  const [bill, setBill] = useState(null);
  // a bill's request, opened from its row (the chain, Take back)
  const [reqOpen, setReqOpen] = useState(null);
  const [sheet, setSheet] = useState(null); // "bill" | "cash"
  const [toast, setToast] = useState(null);
  const tt = useRef(null);
  const say = (m, tone = "ok") => { setToast({ m, tone }); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 3200); };
  useEffect(() => () => clearTimeout(tt.current), []);

  /* ?new=1 (or newClaim) opens "Add a bill" once; the query is then dropped
     so a refresh does not reopen it. */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || data.status !== "ready") return;
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (newClaim || q?.get("new") === "1") {
      asked.current = true;
      setSheet("bill");
      if (q?.get("new")) { q.delete("new"); const s = q.toString(); window.history.replaceState(null, "", window.location.pathname + (s ? "?" + s : "")); }
    }
  }, [data.status, newClaim]);

  const isCur = month === cur;
  const inMonth = L.entries.filter((e) => e.date.slice(0, 7) === month);
  const bills = inMonth.filter((e) => e.kind === "bill");
  const [y, m] = month.split("-").map(Number);
  const weeks = useMemo(() => weeksOf(month)
    .filter((wk) => !isCur || wk.from <= today.getDate())
    .map((wk) => {
      const es = inMonth.filter((e) => { const n = +e.date.slice(8, 10); return n >= wk.from && n <= wk.to; }).reverse();
      const bs = es.filter((e) => e.kind === "bill");
      return { ...wk, es, total: bs.reduce((s, e) => s + e.amount, 0), n: bs.length, now: isCur && wk.from <= today.getDate() && today.getDate() <= wk.to };
    })
    .filter((wk) => wk.es.length || wk.now)
    .reverse(), [month, inMonth, isCur, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const hl = useMemo(() => {
    const out = [];
    const verified = bills.filter((e) => e.state === "Verified");
    if (verified.length) out.push({ key: "paid", value: inr(verified.reduce((s, e) => s + e.amount, 0)), label: "approved", tone: "ok" });
    // cash from Accounts and what they paid for this month's bills
    const added = inMonth.reduce((s, e) => s + (e.kind === "topup" || e.kind === "payout" ? e.amount : e.kind === "bill" && e.state === "Verified" ? e.paid || 0 : 0), 0);
    if (added) out.push({ key: "added", value: inr(added), label: "paid to you", tone: "settle" });
    if (bills.length) out.push({ key: "bills", value: `${bills.length} ${bills.length === 1 ? "bill" : "bills"}`, label: `${inr(bills.reduce((s, e) => s + e.amount, 0))} this month`, tone: "field" });
    // the help requests, first (any month: they are not tied to one)
    const h = helpHighlight(help, () => { setHelpFocus(null); setHelpOpen(true); });
    if (h) out.unshift(h);
    // 26 Nov 2026: a general "Help" card, always first (date + reason only)
    out.unshift(askHighlight(() => setAskOpen(true)));
    return out;
  }, [bills, inMonth, help]);

  const send = async () => {
    // never an empty list: the server would then send every checked bill,
    // the sent-back ones too
    if (!fresh.length) return;
    setSending(true);
    try {
      // a bill whose score never got written: score it now, quietly
      const left = fresh.filter((l) => !l.state || l.state === "Checking").map((l) => l.id);
      if (left.length) await checkSettlementBills(conn, left).catch((e) => console.warn("[expense-claims] bill score:", e.message));
      const r = await sendBillsForApproval(conn, fresh.map((l) => l.id));
      data.reload();
      setSettleTick((t) => t + 1);
      const sent = r?.count ? `${r.count} ${r.count === 1 ? "bill" : "bills"} sent for approval · ${inr(r.amount)}` : "Sent for approval";
      // the bills the server would not send, in its words
      if (r?.refused?.length) say(`${sent}. Not sent: ${r.refused.join(" ")}`, "error");
      else say(sent);
    } catch (e) {
      say(e.message, "error");
    }
    setSending(false);
  };
  // one bill: sent again as it is (sent back), or removed
  const act = async (l, what) => {
    setActing(l.id);
    try {
      if (what === "remove") await removeSettlementBill(conn, l.id);
      else {
        const r = await sendBillsForApproval(conn, [l.id]);
        if (r?.refused?.length && !r.count) throw new Error(r.refused.join(" "));
      }
      setBill(null);
      data.reload();
      setSettleTick((t) => t + 1);
      say(what === "remove" ? "Bill removed" : "Sent again for approval");
    } catch (e) {
      say(e.message, "error");
    }
    setActing("");
  };
  const openHistory = () => (onOpenHistory ? onOpenHistory() : go(historyPath));
  const back = () => (onBack ? onBack() : go(homePath));
  const pad = isDesk ? 32 : 16;
  // the record's number (SE-… / SR-…) is never shown to the rep
  const saved = ({ message }) => {
    setSheet(null);
    data.reload();
    setSettleTick((t) => t + 1);
    say(message || "Saved");
  };

  const over = L.over, has = L.added > 0 || L.balance > 0;
  const say1 = over
    ? <>Owed to you.</>
    : has
      ? <>Left from Accounts’ cash.</>
      : canCash
        ? <>Scan bills as you spend.</>
        : <>Scan bills as you spend.</>;

  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%", minHeight: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: `${isDesk ? 20 : 12}px ${pad}px ${isDesk ? 64 : 28}px`, maxWidth: wide ? 1200 : 760, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" aria-label="Back" className="ec-ghost" onClick={back} style={{ ...btn.icon, width: 40, height: 40, borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", color: "#344054" }}><Icon d={IC.back} size={18} /></button>
          <span style={{ flex: 1, minWidth: 0, fontSize: isDesk ? 24 : 21, fontWeight: 700, letterSpacing: "-0.02em", ...ell }}>Settlements</span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 0, height: 44, padding: 0, borderRadius: 99, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec" }}>
            <button type="button" aria-label="Previous month" disabled={mi <= 0} onClick={() => setMonth(months[mi - 1])} style={{ ...btn.icon, width: 44, height: 44, borderRadius: 99, opacity: mi <= 0 ? 0.3 : 1 }}><Icon d={IC.back} size={14} /></button>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{MON[m - 1]} {y}</span>
            <button type="button" aria-label="Next month" disabled={mi >= months.length - 1} onClick={() => setMonth(months[mi + 1])} style={{ ...btn.icon, width: 44, height: 44, borderRadius: 99, opacity: mi >= months.length - 1 ? 0.3 : 1 }}><Icon d={IC.next} size={14} /></button>
          </span>
        </div>

        {data.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user’s token to load claims.</Note>}
        {data.status === "error" && <Note>{data.error}</Note>}
        {data.status === "ready" && claims.settlementError && (
          <Note style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>Couldn’t load all bills.</span>
            <button type="button" className="ec-ghost" onClick={data.reload} style={{ ...btn.ghost, height: 44, borderRadius: 12 }}>Refresh</button>
          </Note>
        )}
        {data.status === "hidden" && <Note tone="info">Expense claims are not open for your role yet.</Note>}
        {data.status === "loading" && <div aria-busy="true" style={{ ...card, height: 260, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

        {data.status === "ready" && <div style={wide ? { display: "grid", gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)", gap: 20, alignItems: "start" } : { display: "contents" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, ...(wide ? { position: "sticky", top: 16 } : null) }}>
          <section style={{ ...card, padding: isDesk ? "20px 22px" : "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={kicker}><span style={{ width: 6, height: 6, borderRadius: "50%", background: ADV }} />{over ? "Owed to you" : "Cash in hand"}</span>
              {data.refreshing ? <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8a93a3" }}><Spinner size={12} />Updating</span>
                : L.checking > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: "#fffaeb", color: "#b54708" }}>{inr(L.checking)} being checked</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: isDesk ? 44 : 40, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: over ? "#b42318" : "#0b1220", ...tabNum }}>{inr(over || L.balance)}</span>
              <span style={{ fontSize: 14, color: "#5b6576" }}>{over ? "owed to you" : "in hand"}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "#344054" }}>{say1}</p>
            {/* What is still being checked shows as the tag above, not as a step here. */}
            <Rail label="Your settlement" gap={4} role="group">
              <Step k="Paid to you" v={`+ ${inr(L.added)}`} color="#067647" />{arrow("a1")}
              <Step k="Verified bills" v={`− ${inr(L.spent)}`} />{arrow("a2")}
              <Step k={over ? "Owed to you" : "In hand"} v={inr(over || L.balance)} color={over ? "#b42318" : undefined} />
              {L.requested > 0 && <Step k="Requested" v={`+ ${inr(L.requested)}`} color="#b54708" soft="#fffaeb" dashed small="waiting for approval" />}
            </Rail>
            <button type="button" className="ec-cta" onClick={() => setSheet("bill")} style={{ ...btn.primary, height: 52, borderRadius: 14, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 }}><Icon d={IC.camera} size={20} />Scan a bill</button>
            {canCash && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#c0c5cf" }}>
                <button type="button" className="ec-link" onClick={() => setSheet("cash")} style={link}><Icon d={IC.wallet} size={14} />Request advance</button>
              </div>
            )}
          </section>

          {/* the Highlights right after the hero (24 Nov 2026, the user) -- the
              help requests card first */}
          {hl.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Highlights · {monthLabel(month).split(" ")[0]}</span>
              <Highlights items={hl} bleed={wide ? "0px" : pad + "px"} />
            </section>
          )}

          {sentBack.length > 0 && (
            <section aria-label="Bills sent back" style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 0 0 1.5px #d92d20" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{sentBack.length} not valid {sentBack.length === 1 ? "bill" : "bills"}</span>
                <b style={{ fontSize: 18, ...tabNum }}>{inr(sentBack.reduce((s, l) => s + l.amount, 0))}</b>
              </div>
              {sentBack.map((l) => (
                <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: "1px solid #eef1f5" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <b style={{ fontSize: 14, minWidth: 0, ...ell }}>{l.note || "Bill"} · {shortDate(l.date)}</b>
                    <b style={{ fontSize: 14, ...tabNum }}>{inr(l.amount)}</b>
                  </div>
                  <span style={{ fontSize: 12.5, color: "#b42318", lineHeight: 1.45 }}>{l.review}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="ec-cta" disabled={!!acting || sending} onClick={() => act(l, "send")} style={{ ...btn.primary, height: 44, borderRadius: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      {acting === l.id ? <Spinner size={14} /> : <Icon d={IC.arrow} size={15} />}Send again
                    </button>
                    <RemoveBill compact busy={!!acting || sending} onRemove={() => act(l, "remove")} />
                  </div>
                </div>
              ))}
            </section>
          )}
          <SendBar bills={fresh} busy={sending} onSend={send} />
          {settle.error && (
            <Note style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>Couldn’t load your requests.</span>
              <button type="button" className="ec-ghost" onClick={() => setSettleTick((t) => t + 1)} style={{ ...btn.ghost, height: 44, borderRadius: 12 }}>Refresh</button>
            </Note>
          )}
          {/* 26 Nov 2026 (the user): a bill's request shows ON the bill (Bills & cash) -- only advances here */}
          <MyRequests conn={conn} requests={settle.requests.filter((r) => r.kind === "cash")} onChanged={(m) => { data.reload(); setSettleTick((t) => t + 1); say(m); }} />
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Bills &amp; cash</span>
            <div style={{ ...card, padding: "4px 14px 10px" }}>
              {weeks.map((wk) => (
                <div key={wk.from}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 2px 4px" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: wk.now ? "#1d4ed8" : "#0b1220" }}>{wk.from} – {wk.to} {MON[m - 1]}{wk.now ? " · this week" : ""}</span>
                    <span style={{ fontSize: 12, color: "#8a93a3", ...tabNum }}>{wk.n ? `${wk.n} ${wk.n === 1 ? "bill" : "bills"} · ${inr(wk.total)}` : inMonth.length ? "no bills yet" : ""}</span>
                  </div>
                  {wk.es.map((e, i) => {
                    const req = e.line?.settlement ? reqById.get(e.line.settlement) : null;
                    // in approval / approved: open its request (the chain, Take back); else the bill
                    const toReq = req && (req.status === "waiting" || req.status === "approved");
                    return <Entry key={`${e.kind}|${e.line?.id || e.adv?.id || e.claim?.id}|${i}`} e={e} held={heldOf(e.line)} req={req}
                      onOpen={() => (toReq ? setReqOpen(req) : setBill({ ...e, held: heldOf(e.line), req }))} />;
                  })}
                </div>
              ))}
              {!inMonth.length && (
                <div style={{ padding: "22px 8px 12px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{isCur ? "No bills yet" : `No bills in ${monthLabel(month)}`}</div>
              )}
            </div>
            <button type="button" className="ec-link" onClick={openHistory} style={{ alignSelf: "flex-start", height: 32, padding: "0 8px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>All past claims →</button>
          </section>
        </div>}
      </main>

      {reqOpen && conn && <MyRequestSheet conn={conn} r={reqOpen} onClose={() => setReqOpen(null)} onChanged={(m) => { setReqOpen(null); data.reload(); setSettleTick((t) => t + 1); say(m); }} />}
      {bill && <BillDetail conn={conn} e={bill} onClose={() => setBill(null)} busy={!!acting || sending}
        onRemove={removable(bill) ? () => act(bill.line, "remove") : null} onResend={removable(bill) && bill.line.review ? () => act(bill.line, "send") : null} />}
      {sheet === "bill" && conn && me && <BillSheet conn={conn} me={me} claims={claims} advances={advances} cashAdvances={cashAdv} today={today} desk={isDesk} onClose={() => setSheet(null)} onSaved={saved} onChecked={data.reload} onHelp={() => setHelpTick((t) => t + 1)} />}
      {helpOpen && conn && <HelpRequestsSheet key={helpFocus || "list"} conn={conn} list={help} desk={isDesk} focus={helpFocus} onClose={() => setHelpOpen(false)} onChanged={loadHelp} />}
      {askOpen && conn && <AskHelpSheet conn={conn} me={me} desk={isDesk} onClose={() => setAskOpen(false)}
        onRaised={async (task) => { await loadHelp(); setAskOpen(false); setHelpFocus(task.name); setHelpOpen(true); }} />}
      {canCash && sheet === "cash" && conn && me && <CashSheet conn={conn} me={me} claims={claims} advances={advances} cashAdvances={cashAdv} today={today} desk={isDesk} onClose={() => setSheet(null)} onSaved={saved} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: isDesk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.tone === "error" ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px -10px rgba(16,24,40,.5)" }}>{toast.m}</div>
      )}
    </div>
  );
}
