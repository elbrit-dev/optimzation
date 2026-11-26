"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATTACH_ACCEPT, addSettlementBill, checkFile, checkSettlementBills, extractBill, fetchDoctorServices, fetchSettlementSettings, invalidateClaims,
  raiseBillHelp, requestCashThroughChain, searchSettlementDoctors, sendBillsForApproval, uploadPrivateFile,
} from "./data/claimsApi";
import { IC, Icon, Note, Sheet, Spinner, btn, ell, tabNum } from "./ui";
import { inr, isoDay, ledger, shortDate } from "./model";
import { drName, typeLine, waitingOn } from "./settlement";

/* The settlement sheets (Miscellaneous), in the app's theme:
 *
 *   BillSheet  "Add a bill" -- the AI bill check form: what it was for, a
 *              photo of the bill (read once on attach -- Cloudflare Gemma 4,
 *              then Clairic + Clef Flash: title, amount and date;
 *              not-a-bill or unreadable is refused and nothing is saved),
 *              which the person checks and corrects only if needed.
 *              Every bill -- food too -- goes on the settlement claim.
 *              "Check my bill" adds it to the person's open claim; in the
 *              background plain code compares that read with what they sent
 *              (total, date, bill type; each read 90%+ sure) and the bill is
 *              Checked (score 100, or 40 with the reasons). The person then
 *              sends Checked bills up the approval chain from Settlements
 *              (16 Nov 2026). No AI runs again. The form explains none of
 *              this (user, 16 Nov 2026).
 *   CashSheet  "Request cash" -- an Employee Advance, approved up the chain
 *              (BE > ABM > RBM > SM/ZSM > GM > CEO, 16 Nov 2026); the CEO's
 *              approval makes it Verified (nothing more for now).
 *
 * Both end on a success view. */

const CSS = `
.ecs-in{width:100%;height:52px;border-radius:14px;border:1.5px solid #e1e5ec;background:#fff;padding:0 14px;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s}
.ecs-in:focus,.ecs-in:focus-within{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.14)}
.ecs-drop{transition:border-color .15s,background .15s}
.ecs-ch:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
@media (hover:hover) and (pointer:fine){.ecs-drop:hover{border-color:#2563eb!important;background:#f5f8ff!important}}
@keyframes ecs-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
`;
const lbl = { fontSize: 13, fontWeight: 600, color: "#344054" };
const hint = { fontSize: 12.5, color: "#8a93a3" };
// a value read off the bill with a score of 80+: shown, not editable (26 Nov 2026)
const readOnly = { display: "flex", alignItems: "center", minHeight: 52, padding: "0 14px", borderRadius: 14, background: "#f8fafc", boxShadow: "inset 0 0 0 1px #eef1f5", fontSize: 16, color: "#0b1220", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };

/* The success view, inside the sheet. */
function Done({ title, amount, sub, lines, ai }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "28px 20px 8px", textAlign: "center" }}>
      <span style={{ width: 84, height: 84, borderRadius: "50%", background: ai && !ai.ok ? "#fffaeb" : "#ecfdf3", color: ai && !ai.ok ? "#b54708" : "#067647", display: "grid", placeItems: "center", animation: "ecs-pop .5s cubic-bezier(.2,.8,.2,1)", marginBottom: 6 }}><Icon d={ai && !ai.ok ? IC.eye : IC.check} size={40} sw={2.4} /></span>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</span>
      {amount != null && <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, ...tabNum }}>{inr(amount)}</span>}
      {sub && <span style={{ fontSize: 14, color: "#5b6576", lineHeight: 1.45, maxWidth: 420 }}>{sub}</span>}
      {lines?.length > 0 && (
        <div style={{ width: "100%", background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px #e4e7ec", padding: "4px 16px", margin: "6px 0", textAlign: "left" }}>
          {lines.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", fontSize: 14, borderTop: i ? "1px solid #eef1f5" : 0 }}>
              <span style={{ color: "#5b6576", minWidth: 0, ...ell }}>{k}</span><b style={{ ...tabNum, whiteSpace: "nowrap" }}>{v}</b>
            </div>
          ))}
        </div>
      )}
      {ai && <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, color: ai.ok ? "#067647" : "#b54708", lineHeight: 1.4 }}><Icon d={ai.ok ? IC.shield : IC.eye} size={15} />{ai.text}</span>}
    </div>
  );
}

/* Why a photo is refused on attach (extractBill's kind). */
const WRONG = {
  not_a_bill: { title: "Not a bill", text: "Photo the bill itself." },
  unreadable: { title: "Can’t read the bill", text: "Take a clearer photo." },
  failed: { title: "The bill could not be checked", text: "Try again." },
  // 17 Nov 2026: the same register as the planner's trip bills
  duplicate: { title: "This bill was already claimed", text: "" },
};

/* WHO IT WAS FOR (23 Nov 2026, the user): the rep's own expense -- only the
   kinds the settings allow as own; hotel, food, fuel and travel are paid in
   the monthly TA/DA claim -- or money spent on a doctor: up to the activity
   limit a "Doctor activity" (the direct manager approves it), over it tagged
   to a Doctor Service already asked for that doctor. The server decides the
   type from the amount and refuses a wrong combination (settlement_api add_bill). */
// 24 Nov 2026 (the user): short, right under the photo, and Send stays off
const TA_DA_WORD = { Stay: "Hotel", Food: "Food", Fuel: "Fuel", Travel: "Travel" };
const taDaText = (k) => `${TA_DA_WORD[k] || k} bills go in TA/DA.`;
// settlement_api words_of: whole words only ("inn" is not "Innova"), a plural "s" allowed
const wordsOf = (t) => ` ${String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
function taDaKindOf(texts, kinds) {
  for (const t of texts.map(wordsOf)) {
    for (const k of kinds || []) {
      if (k.words.some((w) => w && (t.includes(` ${w} `) || t.includes(` ${w}s `)))) return k.kind;
    }
  }
  return "";
}
/* The own kind a bill is (24 Nov 2026, the user: "the type needs to be
   selected based on the bill"): the same whole-word match on what the reader
   read (its title, the vendor) -- only kinds the settings allow as own. */
function ownKindOf(texts, kinds, allowed) {
  return taDaKindOf(texts, (kinds || []).filter((k) => allowed.includes(k.kind)));
}

/* Money in short, for the footer: +in hand / −owed on the open claim. */
const signed = (L) => L.balance - (L.over - L.owedClosed);

export function BillSheet({ conn, me, claims = [], advances = [], cashAdvances = null, today = new Date(), onClose, onSaved, onChecked, onHelp, desk }) {
  const todayIso = isoDay(today);
  // the server takes no bill older than a year (settlement_api BILL_MAX_AGE_DAYS)
  const minIso = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365));
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso);
  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [read, setRead] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(null);
  const pick = useRef(null);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);
  // A handwritten bill (16 Nov 2026, as on the planner): why only a
  // handwritten bill, and the payment proof -- or "Paid in cash".
  const [why, setWhy] = useState("");
  const [cash, setCash] = useState(false);
  const [proof, setProof] = useState(null);
  const [proofThumb, setProofThumb] = useState(null);
  const proofPick = useRef(null);
  useEffect(() => () => { if (proofThumb) URL.revokeObjectURL(proofThumb); }, [proofThumb]);
  const pickProof = (f) => {
    const err = checkFile(f);
    if (err) return setError(err);
    setError("");
    setProof(f);
    setProofThumb(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const L = useMemo(() => ledger(claims, advances, cashAdvances), [claims, advances, cashAdvances]);
  const now = signed(L);
  const amt = Number(amount) || 0;
  const after = now - amt;

  // who it was for: "me" (own, a kind) or "doctor" (a doctor; over the limit, a service)
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchSettlementSettings(conn).then((x) => alive && setSettings(x));
    return () => { alive = false; };
  }, [conn]);
  const limit = settings?.activityLimit || 2000;
  /* the bill's date: within the year, not in the future -- and inside the window the ERP
     opens Settlement for (25 Nov 2026: October 2026 alone) */
  const loIso = settings?.billsFrom && settings.billsFrom > minIso ? settings.billsFrom : minIso;
  const hiIso = settings?.billsTo && settings.billsTo < todayIso ? settings.billsTo : todayIso;
  const outWin = date < loIso || date > hiIso;
  // once the window is known, a date still on today's default moves into it
  useEffect(() => {
    if (settings?.billsTo && date === todayIso && todayIso > hiIso) setDate(hiIso);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownKinds = settings?.ownKinds || [];
  // 24 Nov 2026 (the user): "Own expense" is picked to start with
  const [forWho, setForWho] = useState("me");
  const [kind, setKind] = useState("");
  // the kind is picked off the bill until the rep picks one themselves
  const kindPicked = useRef(false);
  const [kindAuto, setKindAuto] = useState(false);
  const [doctor, setDoctor] = useState(null); // { id, name, city }
  const [dq, setDq] = useState("");
  const [found, setFound] = useState({ q: "", list: [], busy: false, error: "" });
  const [svcs, setSvcs] = useState({ doctor: "", list: null, busy: false, error: "" });
  const [svc, setSvc] = useState("");
  const over = forWho === "doctor" && amt > limit;
  // the Settlement Settings switch (24 Nov 2026): over the limit, tag to a
  // Doctor Service (on, as before) -- or off: just the day the service was
  // done, and it goes like a doctor activity (one approval)
  const needSvc = settings?.serviceNeedsRecord !== false;
  const [svcDay, setSvcDay] = useState("");
  // a blocked Send's message is about the choices made then: drop it once they change
  useEffect(() => { setError(""); }, [forWho, kind, doctor, svc, svcDay, amt]);
  // the doctor search: 2+ letters, 300 ms after the last key
  useEffect(() => {
    const q = dq.trim();
    if (forWho !== "doctor" || doctor || q.length < 2) { setFound({ q: "", list: [], busy: false, error: "" }); return undefined; }
    let alive = true;
    setFound((f) => ({ ...f, busy: true, error: "" }));
    const t = setTimeout(() => {
      searchSettlementDoctors(conn, q)
        .then((list) => alive && setFound({ q, list, busy: false, error: "" }))
        .catch((e) => alive && setFound({ q, list: [], busy: false, error: e.message }));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [conn, dq, forWho, doctor]);
  // the doctor's services, once the amount is over the limit (asked once per
  // doctor; "Change" asks again). An answer for another doctor is dropped.
  // 24 Nov 2026 (the user): only the services of the BILL'S MONTH -- asked
  // again when the doctor or the bill's month changes
  const svcAsked = useRef("");
  const svcMonth = String(date || "").slice(0, 7);
  const svcKey = doctor ? doctor.id + "|" + svcMonth : "";
  useEffect(() => {
    if (!over || !needSvc || !doctor || svcAsked.current === svcKey) return;
    const id = doctor.id;
    const key = svcKey;
    svcAsked.current = key;
    setSvc("");
    setSvcs({ doctor: key, list: null, busy: true, error: "" });
    fetchDoctorServices(conn, id, date)
      .then((list) => setSvcs((x) => (x.doctor === key ? { doctor: key, list, busy: false, error: "" } : x)))
      .catch((e) => setSvcs((x) => (x.doctor === key ? { doctor: key, list: null, busy: false, error: e.message } : x)));
  }, [conn, over, needSvc, doctor, svcKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const svcList = doctor && svcs.doctor === svcKey ? svcs.list : null;
  const picked = svcList?.find((x) => x.name === svc) || null;
  // an own bill that is really TA/DA: by the reader's kind, its title, or the title typed
  const taDa = forWho === "me" ? taDaKindOf([read?.readerKind, read?.readTitle, title], settings?.taDaKinds) : "";
  const taDaMsg = taDa ? taDaText(taDa) : "";
  // a good own bill: its kind from the bill -- else Other -- once it is read
  useEffect(() => {
    if (!read || read.busy || read.wrong || !settings || kindPicked.current) return;
    // a TA/DA bill has no own kind: left empty (it cannot be sent anyway)
    if (taDaKindOf([read.readerKind, read.readTitle], settings.taDaKinds)) { setKind(""); setKindAuto(false); return; }
    const k =ownKindOf([read.readTitle, read.clefTitle, read.what, read.vendor], settings.ownKindWords, ownKinds) || (ownKinds.includes("Other") ? "Other" : "");
    setKind(k);
    setKindAuto(!!k);
  }, [read, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickDoctor = (d) => { setDoctor(d); setSvc(""); setDq(""); };

  /* HELP (24 Nov 2026, the user: "like the help in the planner"): once the
     photo is in, the rep can raise a request -- an ERP Task for the expense
     team, with the photo and the form exactly as it stands.
     26 Nov 2026 (the user): Help sits right under the photo, and TURNS THE
     FORM INTO THE HELP FORM -- the read values open for editing, a reason box
     comes at the bottom, and the button becomes "Submit for help". A bill read
     with a score of 80 or more shows what was read as plain text (no editing);
     Help is then the only way to correct it -- the team gets the AI's read and
     the rep's corrected values side by side. Below 80 the fields are open. */
  const [help, setHelp] = useState({ mode: false, reason: "", busy: false, error: "" });
  // read with a score of 80+ and not handwritten / entered by hand: read values are locked
  const trusted = !!read && !read.busy && !read.wrong && !read.manual && !read.handwritten && (read.score ?? 0) >= 80;
  const lock = { title: trusted && !help.mode && !!read?.got?.title, amount: trusted && !help.mode && !!read?.got?.amount, date: trusted && !help.mode && !!read?.got?.date };
  const startHelp = () => { setHelp({ mode: true, reason: "", busy: false, error: "" }); setError(""); };
  // help opened: the form slides up so the fields it opened are in view (26 Nov 2026)
  const helpRef = useRef(null);
  useEffect(() => {
    if (!help.mode) return undefined;
    const t = setTimeout(() => helpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [help.mode]);
  // help called off: back to what was read
  const stopHelp = () => {
    const o = read?.orig;
    if (o) { setTitle(o.title); setAmount(o.amount); setDate(o.date); }
    setHelp({ mode: false, reason: "", busy: false, error: "" });
  };
  const helpDetails = () => [
    `Employee: ${me?.name || me?.id || "-"}${me?.id && me?.name ? ` (${me.id})` : ""}`,
    `Who it was for: ${forWho === "doctor" ? "For a doctor" : "Own expense"}`,
    `Photo: ${file?.name || "-"}`,
    `What was it for: ${title.trim() || "-"}`,
    `Amount: ${amt ? inr(amt) : "-"}`,
    `Bill date: ${date || "-"}`,
    forWho === "doctor" ? `Doctor: ${doctor ? `${doctor.name} (${doctor.id})` : "-"}` : `Kind: ${kind || "-"}`,
    over && needSvc ? `Doctor service: ${picked ? `${picked.service} (${picked.name})` : "-"}` : "",
    over && !needSvc ? `Service done on: ${svcDay || "-"}` : "",
    `Read off the bill: ${[read?.readTitle, read?.vendor].filter(Boolean).join(" · ") || "-"}${read?.handwritten ? " · handwritten" : ""}`,
    read?.wrong ? `Refused: ${WRONG[read.wrong].title}${read.why ? ` — ${read.why}` : ""}` : "",
    taDaMsg ? `Blocked: ${taDaMsg}` : "",
  ].filter(Boolean).join("\n");
  // what the AI read against what the rep has now, field by field
  const readVsNow = () => {
    const o = read?.orig;
    if (!o) return "";
    const row = (k, a, b) => `- ${k}: read ${a || "—"}${String(a || "") !== String(b || "") ? ` → changed to ${b || "—"}` : " (unchanged)"}`;
    return [`AI read (score ${read.score ?? 0}%):`, row("What was it for", o.title, title.trim()), row("Amount", o.amount && inr(+o.amount), amt && inr(amt)), row("Bill date", o.date, date)].join("\n");
  };
  const sendHelp = async () => {
    if (help.busy) return;
    if (help.reason.trim().length < 5) return setHelp((h) => ({ ...h, error: "Add a reason." }));
    setHelp((h) => ({ ...h, busy: true, error: "" }));
    try {
      const task = await raiseBillHelp(conn, {
        file, date, title: title.trim() || read?.readTitle || "Bill", message: help.reason,
        details: [helpDetails(), readVsNow()].filter(Boolean).join("\n\n"),
      });
      setHelp((h) => ({ ...h, busy: false }));
      onHelp?.(task);
      setDone({ help: task, lines: [["Request", task.name], ["Bill", `${title.trim() || "Bill"} · ${shortDate(date)}`]] });
    } catch (e) {
      setHelp((h) => ({ ...h, busy: false, error: e.message }));
    }
  };

  const attach = (f) => {
    const err = checkFile(f);
    if (err) return setError(err);
    setError("");
    setFile(f);
    setThumb(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setRead({ busy: true, file: f });
    // a new photo: out of help, if it was in it
    setHelp({ mode: false, reason: "", busy: false, error: "" });
    // a new bill: its kind is picked off it again
    kindPicked.current = false;
    setKind("");
    setKindAuto(false);
    // The one AI run (Gemma 4 -> Clairic + Clef Flash; 16 Nov 2026): title,
    // amount and date come off the bill; the person checks them,
    // changes any if needed, and sends. The signed read goes along to the check.
    extractBill(conn, f)
      .then((x) => {
        const wrong = x.kind === "not_a_bill" ? "not_a_bill" : !x.readable ? "unreadable" : x.duplicate ? "duplicate" : null;
        if (wrong) return setRead((r) => (r?.busy && r.file === f ? { busy: false, wrong, why: x.duplicate || "" } : r));
        const what = String(x.what || x.vendor || "").trim();
        const t0 = what ? what.charAt(0).toUpperCase() + what.slice(1, 60) : "";
        const a0 = x.amount ? String(x.amount) : "";
        const dated = !!x.date && x.date <= todayIso;
        const d0 = dated ? x.date : todayIso;
        setTitle(t0);
        setAmount(a0);
        setDate(d0);
        // what was really read off the bill (the date may be today's, defaulted)
        const got = { title: !!what, amount: !!x.amount, date: dated };
        // the read's SCORE (26 Nov 2026): how sure the reader is, 0-100 -- the
        // lowest of "it is a bill" and the total's and the date's confidence
        // (what the check after saving holds the bill to)
        const rd = x.signed?.read || {};
        const cf = rd.confidence || {};
        const sure = [typeof rd.billProbability === "number" ? rd.billProbability : rd.titleConfidence, got.amount ? cf.total : null, got.date ? cf.date : null]
          .filter((n) => typeof n === "number");
        const score = sure.length ? Math.round(Math.min(...sure) * 100) : 0;
        setRead((r) => (r?.busy && r.file === f ? { busy: false, filled: !!(x.amount || dated || what), got, score, orig: { title: t0, amount: a0, date: d0 }, signed: x.signed || null, dup: x.dupOf || null, manual: !!x.skipped, handwritten: !!x.handwritten, readerKind: x.readerKind || "", readTitle: x.readTitle || "", clefTitle: x.clefTitle || "", what, vendor: x.vendor || "" } : r));
      })
      .catch(() => setRead((r) => (r?.busy && r.file === f ? { busy: false, wrong: "failed" } : r)));
  };

  const missing = !forWho ? "Pick Own or Doctor"
    : !file ? "Add the bill photo"
    : read?.busy ? "Reading the bill…"
    : read?.wrong ? WRONG[read.wrong].title
    : !title.trim() ? "Add what it was for"
    : !amt ? "Add the amount"
    : date < minIso ? "Bill over a year old"
    : outWin && settings?.windowText ? settings.windowText
    : read?.handwritten && why.trim().length < 5 ? "Add why handwritten"
    : read?.handwritten && !cash && !proof ? "Add proof or tick cash"
    : forWho === "me" && taDa ? taDaMsg
    : forWho === "me" && !kind ? "Pick the kind"
    : forWho === "doctor" && !doctor ? "Pick the doctor"
    : over && !needSvc && !svcDay ? "Pick the service day"
    : over && !needSvc && (svcDay > todayIso || svcDay < minIso) ? "Service day out of range"
    : !over || !needSvc ? ""
    : svcs.doctor === svcKey && svcs.error ? svcs.error
    : !svcList ? "Loading services…"
    : !svcList.length ? "No service this month"
    : !picked ? "Pick the service"
    : amt > picked.left + 0.5 ? `Only ${inr(picked.left)} left` : "";
  const submit = async () => {
    setTried(true);
    if (missing) return setError(missing);
    setError("");
    // 23 Nov 2026: each bill is its own Settlement Expense, made through the
    // Settlement API -- no Expense Claim. The photos go up first, private and
    // attached to nothing; the API attaches them to the bill it makes.
    let name, proofUrl = null;
    const waiting = (L.open?.lines || []).filter((l) => l.bill && (l.state || "Checking") === "Checking").map((l) => l.id);
    try {
      setBusy("Uploading the bill…");
      // the bill and its payment proof (the approvers open it too) side by side
      const [up, upProof] = await Promise.all([
        uploadPrivateFile(conn, file),
        read?.handwritten && !cash && proof ? uploadPrivateFile(conn, proof) : null,
      ]);
      if (upProof) proofUrl = upProof.file_url;
      setBusy("Saving…");
      const handNote = read?.handwritten ? `${why.trim()}${cash ? " · paid in cash" : ""}` : "";
      name = (await addSettlementBill(conn, {
        date, title: title.trim(), amount: amt, bill: up.file_url, proof: proofUrl, handNote,
        kind: forWho === "me" ? kind : "", doctor: forWho === "doctor" ? doctor?.id : "", doctorService: over && needSvc ? picked?.name : "", serviceDate: over && !needSvc ? svcDay : "",
      })).name;
    } catch (e) {
      setBusy("");
      invalidateClaims(conn, me.id);
      return setError(e.message);
    }
    // The score (16 Nov 2026, user): Gemma is near perfect, so the form only
    // fills in what it read and the person changes anything wrong. The score
    // -- what was sent against what was read -- is worked out here, quietly
    // (plain code, no AI), and shown only to the approvers with the risk. The
    // person is told nothing about it. If it fails, the bill stays "Checking"
    // and is scored when it is sent for approval.
    setBusy("Saving…");
    let scored = false;
    try {
      const hand = read?.handwritten ? { why: why.trim(), cash, proof: cash ? null : proofUrl } : undefined;
      const r = await checkSettlementBills(conn, [name, ...waiting], read?.signed ? { [name]: { ...read.signed, hand } } : undefined);
      // { skipped } = the check did not run: the bill is saved, not scored
      scored = !r?.skipped;
    } catch (e) {
      console.warn("[expense-claims] bill score:", e.message);
    }
    // ...and sent for approval right away (16 Nov 2026, user: no second step).
    // Just this bill -- one sent back stays with the rep until it is fixed.
    // If this fails, the Settlements page offers "Send for approval" for it.
    let sent = null;
    let refused = "";
    if (scored) {
      setBusy("Sending for approval…");
      // refused: the server would not send it (an own bill whose photo is a
      // hotel / food / fuel / travel bill ...) -- the rep is told why
      sent = await sendBillsForApproval(conn, [name]).catch((e) => { console.warn("[expense-claims] send:", e.message); refused = e.message; return null; });
      if (sent?.refused?.length) refused = sent.refused.join(" ");
    }
    invalidateClaims(conn, me.id);
    onChecked?.();
    setBusy("");
    const first = sent?.requests?.[0];
    const lines = [[`${title.trim()} · ${shortDate(date)}`, inr(amt)]];
    lines.push(["For", typeLine(forWho === "me" ? { settleType: "Own", expenseKind: kind }
      : { settleType: over ? "Doctor service" : "Doctor activity", doctorName: doctor?.name, doctorService: over && needSvc ? picked?.service : "", serviceDate: over && !needSvc ? svcDay : "" })]);
    if (first && waitingOn(first)) lines.push(["Now", waitingOn(first).replace(/^with/, "With")]);
    setDone({ name, sent: !!first, lines, refused });
  };

  // never closed mid-save: the bill would be half made with nobody told
  const close = () => {
    if (busy || help.busy) return;
    if (done && !done.help) onSaved?.({ name: done.name, message: done.sent ? "Sent for approval" : "Saved — not sent yet" });
    else onClose?.();
  };
  const helpReady = help.reason.trim().length >= 5 && !help.busy;
  const footer = done ? (
    <button type="button" className="ec-cta" onClick={close} style={{ ...btn.primary, flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Done</button>
  ) : help.mode ? (
    <>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.4, color: "#5b6576" }}>Goes to the expense team</span>
      <button type="button" className="ec-cta" disabled={!helpReady} onClick={sendHelp} style={{ ...btn.primary, height: 50, padding: "0 20px", borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", gap: 8, opacity: helpReady ? 1 : 0.5 }}>
        {help.busy ? <><Spinner size={14} />Sending…</> : <><Icon d={IC.arrow} size={18} />Submit for help</>}
      </button>
    </>
  ) : (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* money owed to the rep is good news: never red */}
        <span style={{ fontSize: 12, color: "#5b6576" }}>{!amt ? (now >= 0 ? "In hand now" : "We owe you now") : after >= 0 ? "In hand after this" : "If approved, we owe you"}</span>
        <b style={{ fontSize: 22, letterSpacing: "-0.02em", color: "#0b1220", ...tabNum }}>{inr(Math.abs(amt ? after : now))}</b>
      </div>
      {/* an own TA/DA bill (hotel, food, fuel, travel) can never be sent: off */}
      {/* off (and looking off) for an own TA/DA bill, a refused photo, or one still being read */}
      <button type="button" className="ec-cta" disabled={!!busy || !!taDaMsg || !!read?.wrong || !!read?.busy} onClick={submit} style={{ ...btn.primary, height: 50, padding: "0 22px", borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", gap: 8, opacity: taDaMsg || read?.wrong || read?.busy ? 0.45 : missing && tried ? 0.55 : 1, cursor: taDaMsg || read?.wrong || read?.busy ? "not-allowed" : undefined }}>
        {busy ? <><Spinner size={14} />{busy}</> : <><Icon d={IC.arrow} size={18} />Send for approval</>}
      </button>
    </>
  );

  return (
    <Sheet title={done ? "" : "Add a bill"} sub={null}
      onClose={close} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {done ? (done.help
        ? <Done title="Help request sent" amount={amt} lines={done.lines} sub="Reply comes in Help requests." />
        : <Done title={done.sent ? "Sent for approval" : "Saved — not sent yet"} amount={amt} lines={done.lines} sub={done.sent ? null : done.refused || "Send it from Settlements."} />) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: desk ? "18px 24px 20px" : "14px 16px 18px" }}>
          {/* 24 Nov 2026 (the user): the type comes FIRST, as two tabs -- the
              photo can be added only once it is picked */}
          <div role="radiogroup" aria-label="Who was this for?" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 14, background: "#e9ecf1", boxShadow: tried && !forWho ? "0 0 0 1.5px #f04438" : "none" }}>
            {[["me", "Own expense"], ["doctor", "For a doctor"]].map(([k, t]) => (
              <button key={k} type="button" className="ecs-ch" role="radio" aria-checked={forWho === k} onClick={() => setForWho(k)}
                style={{ minHeight: 44, border: 0, borderRadius: 10, background: forWho === k ? "#fff" : "transparent", boxShadow: forWho === k ? "0 1px 2px rgba(16,24,40,.14)" : "none", color: forWho === k ? "#0b1220" : "#475467", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{t}</button>
            ))}
          </div>
          {forWho && (
          <button type="button" className="ecs-drop" onClick={() => pick.current?.click()}
            style={{ display: "flex", flexDirection: file ? "row" : "column", alignItems: "center", justifyContent: "center", gap: file ? 12 : 6, width: "100%", minHeight: file ? 76 : 150, padding: file ? "10px 12px" : "18px 14px", borderRadius: 16, border: `1.5px ${file ? "solid" : "dashed"} ${read?.wrong || (file && taDaMsg) ? "#f04438" : file && read?.dup ? "#f79009" : file ? "#12b76a" : tried && !file ? "#f04438" : "#b2c8f7"}`, background: read?.wrong || (file && taDaMsg) ? "#fef3f2" : file && read?.dup ? "#fffcf5" : file ? "#f6fef9" : "#f5f8ff", color: "#0b1220", textAlign: file ? "left" : "center", cursor: "pointer" }}>
            {file ? (
              <>
                {thumb ? <img src={thumb} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", flex: "none", boxShadow: "0 0 0 1px #e4e7ec" }} />
                  : <span style={{ width: 54, height: 54, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", color: "#475467" }}><Icon d={IC.file} size={22} /></span>}
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{file.name}</span>
                  <span style={{ fontSize: 12.5, color: read?.wrong || taDaMsg ? "#b42318" : read?.busy ? "#475467" : read?.dup ? "#b54708" : "#067647", fontWeight: 600 }}>{read?.wrong ? (read.wrong === "failed" ? "Check failed" : "Wrong photo") : read?.busy ? "Reading the bill…" : taDaMsg ? "Not an own expense" : read?.dup ? "Claimed before — see below" : "Photo added"}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>{read?.wrong ? "Choose another" : "Change"}</span>
              </>
            ) : (
              <>
                <span style={{ color: "#2563eb", display: "flex", marginBottom: 4 }}><Icon d={IC.camera} size={30} /></span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Scan the bill</span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1d4ed8", textDecoration: "underline", textUnderlineOffset: 3, marginTop: 4 }}>Choose photo</span>
              </>
            )}
          </button>
          )}
          <input ref={pick} type="file" accept={ATTACH_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attach(f); }} />
          {file && !read?.busy && !read?.wrong && taDaMsg && (
            <div role="alert" style={{ marginTop: -8, padding: "9px 12px", borderRadius: 12, background: "#fef3f2", color: "#b42318", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
              {taDaMsg}{" "}
              <button type="button" onClick={() => setForWho("doctor")} style={{ padding: 0, border: 0, background: "transparent", color: "#1d4ed8", font: "inherit", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>Spent on a doctor?</button>
            </div>
          )}
          {read?.wrong ? (
            <div role="alert" style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#fef3f2", color: "#b42318" }}>
              <span style={{ display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.x} size={18} sw={2.2} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <b style={{ fontSize: 13.5 }}>{WRONG[read.wrong].title}</b>
                <span style={{ fontSize: 13, color: "#7a271a", lineHeight: 1.45 }}>{read.wrong === "duplicate" && read.why ? `${read.why} ` : ""}{WRONG[read.wrong].text}</span>
              </span>
            </div>
          ) : null}

          {/* a bill claimed before (26 Nov 2026): flagged, NOT refused -- who and
              when; it can still be sent, the approvers see both side by side */}
          {file && !read?.busy && read?.dup && (() => {
            const d = read.dup;
            const where = /^a settlement bill/.test(d.where) ? "as a settlement bill" : "on a TA/DA trip";
            const bits = [d.bill_date && `bill of ${shortDate(d.bill_date)}`, d.amount ? inr(d.amount) : "", d.vendor].filter(Boolean).join(" · ");
            return (
              <div role="alert" style={{ marginTop: -8, display: "flex", gap: 10, padding: "11px 13px", borderRadius: 14, background: "#fffaeb", boxShadow: "inset 0 0 0 1px #fedf89", color: "#93370d" }}>
                <span style={{ display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.file} size={17} /></span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{d.sure ? (d.mine ? "You already claimed this bill" : `Already claimed by ${d.employee_name}`) : (d.mine ? "Looks like a bill you claimed before" : `Looks like a bill ${d.employee_name} claimed`)}</b>
                  <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "#7a2e0e" }}>
                    {where}{d.claimed_on ? ` on ${shortDate(d.claimed_on)}` : ""}{bits ? ` — ${bits}` : ""}. You can still send it.
                  </span>
                </span>
              </div>
            );
          })()}

          {/* Help, right under the photo (26 Nov 2026) -- once it is read */}
          {file && !read?.busy && (help.mode ? (
            <div ref={helpRef} role="status" style={{ scrollMarginTop: 12, display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px 11px 14px", borderRadius: 14, background: "#eef3fe", color: "#1d4ed8" }}>
              <span style={{ display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.help} size={18} /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45, color: "#1e3a8a" }}><b>Help request.</b> Fix and add a reason.</span>
              <button type="button" disabled={help.busy} onClick={stopHelp} style={{ flex: "none", minHeight: 32, padding: "0 6px", border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={startHelp}
              style={{ alignSelf: "flex-start", marginTop: -6, minHeight: 36, display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 6px", border: 0, borderRadius: 10, background: "transparent", color: "#1d4ed8", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              <Icon d={IC.help} size={16} />Need help?
            </button>
          ))}

          {file && read?.busy && (
            <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 14, background: "#f5f8ff", color: "#1d4ed8", fontSize: 14, fontWeight: 600 }}>
              <Spinner size={16} />Reading the bill…
            </div>
          )}
          {file && !read?.busy && (!read?.wrong || help.mode) && (
            <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>What was it for</span>
              {lock.title ? <span style={readOnly}>{title || "—"}</span>
                : <input className="ecs-in" aria-label="What was it for" placeholder="e.g. Fuel – Salem trip, Team lunch" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: tried && !title.trim() ? "#f04438" : undefined }} />}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={lbl}>Bill amount</span>
                {lock.amount ? <span style={{ ...readOnly, height: 58, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", ...tabNum }}>{inr(amt)}</span> : (
                  <span className="ecs-in" style={{ display: "flex", alignItems: "center", gap: 8, height: 58, borderColor: tried && !amt ? "#f04438" : undefined }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#475467" }}>₹</span>
                    <input inputMode="decimal" placeholder="0" aria-label="Bill amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", ...tabNum }} />
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={lbl}>Bill date</span>
                {lock.date ? <span style={{ ...readOnly, height: 58, fontSize: 15, ...(outWin ? { color: "#b42318", boxShadow: "inset 0 0 0 1.5px #f04438" } : null) }}>{shortDate(date)} {date.slice(0, 4)}</span>
                  : <input type="date" className="ecs-in" aria-label="Bill date" min={loIso} max={hiIso} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ height: 58, fontSize: 15, borderColor: (tried && date < minIso) || outWin ? "#f04438" : undefined }} />}
              </div>
            </div>
            <span style={{ ...hint, marginTop: -8 }}>{(() => {
              if (help.mode) return "Fix what’s wrong";
              if (trusted && (lock.title || lock.amount || lock.date)) return `Read from bill · ${read.score}%`;
              if (read?.manual) return "Type as on the bill";
              // only what was really read off the bill is called "filled"
              const got = read?.got || {};
              const names = [got.title && "what it was for", got.amount && "the amount", got.date && "the date"].filter(Boolean);
              if (!read?.filled || !names.length) return "Not read — type as on the bill";
              const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
              return `From the bill${got.date ? "" : " · check the date"}`;
            })()}</span>


            {forWho === "me" && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={lbl}>What kind</span>
                  <select className="ecs-in" value={kind} onChange={(e) => { kindPicked.current = true; setKindAuto(false); setKind(e.target.value); }} disabled={!settings}
                    style={{ appearance: "auto", borderColor: tried && !kind ? "#f04438" : undefined, color: kind ? "#0b1220" : "#8a93a3" }}>
                    <option value="">{settings ? "Choose the kind of expense" : "Loading…"}</option>
                    {ownKinds.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                {kindAuto && kind && !taDaMsg && <span style={{ ...hint, marginTop: -8 }}>From the bill</span>}
              </>
            )}

            {forWho === "doctor" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {doctor ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={lbl}>Doctor</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 6px 14px", borderRadius: 14, background: "#f6fef9", boxShadow: "0 0 0 1px #abefc6" }}>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        <b style={{ fontSize: 14.5, ...ell }}>{drName(doctor.name)}</b>
                        <span style={{ fontSize: 12.5, color: "#5b6576", ...ell }}>{[doctor.city, doctor.id].filter(Boolean).join(" · ")}</span>
                      </span>
                      <button type="button" className="ecs-ch" onClick={() => { setDoctor(null); setSvc(""); svcAsked.current = ""; setSvcs({ doctor: "", list: null, busy: false, error: "" }); }} style={{ minHeight: 44, minWidth: 44, padding: "0 10px", border: 0, borderRadius: 10, background: "transparent", fontSize: 13, fontWeight: 600, color: "#1d4ed8", cursor: "pointer" }}>Change</button>
                    </span>
                  </div>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={lbl}>Which doctor</span>
                    <input className="ecs-in" type="search" placeholder="Search doctor" value={dq} maxLength={60} onChange={(e) => setDq(e.target.value)}
                      aria-describedby="ecs-dr-hint" style={{ borderColor: tried && !doctor ? "#f04438" : undefined }} />
                  </label>
                )}
                {!doctor && (
                  <div id="ecs-dr-hint" aria-live="polite" style={{ display: "flex", flexDirection: "column" }}>
                    {found.busy ? <span style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={12} />Looking…</span>
                      : found.error ? <Note>{found.error}</Note>
                      : dq.trim().length >= 2 && found.q && !found.list.length ? <span style={hint}>No match</span>
                      : null}
                    {found.list.length > 0 && !found.busy && (
                      <div role="listbox" aria-label="Doctors" style={{ borderRadius: 14, boxShadow: "0 0 0 1px #e4e7ec", background: "#fff", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                        {found.list.map((d, i) => (
                          <button key={d.id} type="button" className="ecs-ch" role="option" aria-selected={false} onClick={() => pickDoctor(d)}
                            style={{ width: "100%", minHeight: 52, display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, padding: "8px 14px", border: 0, borderTop: i ? "1px solid #eef1f5" : 0, background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit", color: "#0b1220" }}>
                            <b style={{ fontSize: 14, maxWidth: "100%", ...ell }}>{drName(d.name)}</b>
                            <span style={{ fontSize: 12.5, color: "#5b6576", maxWidth: "100%", ...ell }}>{[d.city, d.id].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {doctor && !over && <Note tone="info">Doctor activity · manager approves</Note>}
                {doctor && over && !needSvc && (
                  <>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={lbl}>Which day was the service done?</span>
                      <input type="date" className="ecs-in" min={minIso} max={todayIso} value={svcDay} onChange={(e) => setSvcDay(e.target.value)}
                        style={{ height: 58, fontSize: 15, borderColor: tried && !svcDay ? "#f04438" : undefined }} />
                    </label>
                    <Note tone="info">Doctor service · manager approves</Note>
                  </>
                )}
                {doctor && over && needSvc && (
                  <div role="radiogroup" aria-label="The doctor service it was for" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={lbl}>Doctor service (over {inr(limit)})</span>
                    {svcs.doctor === svcKey && svcs.error ? <Note>{svcs.error}</Note>
                      : !svcList ? <span style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={12} />Loading the doctor services…</span>
                      : !svcList.length ? <Note>No service this month</Note>
                      : svcList.map((x) => {
                        const on = svc === x.name;
                        return (
                          <button key={x.name} type="button" className="ecs-ch" role="radio" aria-checked={on} onClick={() => setSvc(x.name)}
                            style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: `1.5px solid ${on ? "#2563eb" : tried && !svc ? "#f04438" : "#e1e5ec"}`, background: on ? "#f5f8ff" : "#fff", textAlign: "left", cursor: "pointer", font: "inherit", color: "#0b1220" }}>
                            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                              <b style={{ fontSize: 14, ...ell }}>{x.service}</b>
                              <span style={{ fontSize: 12.5, color: "#5b6576", ...tabNum }}>{[x.date ? shortDate(x.date) : "", inr(x.amount), `${inr(x.left)} left`].filter(Boolean).join(" · ")}</span>
                            </span>
                            <span style={{ flex: "none", fontSize: 12, fontWeight: 700, color: x.approved ? "#067647" : "#b54708" }}>{x.approved ? "approved" : "waiting for approval"}</span>
                          </button>
                        );
                      })}
                    {picked && amt > picked.left + 0.5 && <Note>Only {inr(picked.left)} is left on this doctor service.</Note>}
                    {picked && !picked.approved && <Note tone="info">Paid once service is approved</Note>}
                  </div>
                )}
              </div>
            )}
            {read?.handwritten && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 14, background: "#fffaeb", boxShadow: "0 0 0 1px #fedf89" }}>
                <b style={{ fontSize: 13.5, color: "#93370d" }}>Handwritten bill</b>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={lbl}>Why handwritten?</span>
                  <textarea className="ecs-in" rows={2} value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Local taxi"
                    style={{ height: "auto", minHeight: 64, padding: "10px 12px", fontSize: 14, resize: "vertical", borderColor: tried && why.trim().length < 5 ? "#f04438" : undefined }} />
                </label>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={lbl}>Payment proof</span>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 4px", fontSize: 13, fontWeight: 600, color: "#344054", cursor: "pointer" }}>
                      <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} style={{ width: 20, height: 20, margin: 0, accentColor: "#2563eb" }} />
                      Paid in cash
                    </label>
                  </span>
                  {cash ? (
                    <span style={{ fontSize: 12.5, color: "#5b6576" }}>Paid in cash</span>
                  ) : proof ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "#f6fef9", boxShadow: "0 0 0 1px #abefc6" }}>
                      {proofThumb ? <img src={proofThumb} alt="Payment proof" style={{ width: 40, height: 48, borderRadius: 8, objectFit: "cover", flex: "none" }} /> : <Icon d={IC.file} size={18} />}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#067647", ...ell }}>{proof.name || "Payment proof"}</span>
                      <button type="button" onClick={() => proofPick.current?.click()} style={{ minHeight: 44, minWidth: 44, padding: "0 10px", border: 0, borderRadius: 10, background: "transparent", fontSize: 13, fontWeight: 600, color: "#1d4ed8", cursor: "pointer" }}>Change</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => proofPick.current?.click()}
                      style={{ minHeight: 46, borderRadius: 12, border: `1.5px dashed ${tried ? "#f04438" : "#b2c8f7"}`, background: "#f5f8ff", color: "#1d4ed8", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                      Add payment proof
                    </button>
                  )}
                  <input ref={proofPick} type="file" accept={ATTACH_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickProof(f); }} />
                </span>
              </div>
            )}

            </>
          )}

          {error && error !== taDaMsg && !help.mode && <Note>{error}</Note>}

          {/* help mode: the reason, at the bottom of the form (26 Nov 2026) */}
          {help.mode && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>Reason for help</span>
              <textarea className="ecs-in" rows={3} value={help.reason} maxLength={1000} disabled={help.busy}
                onChange={(e) => setHelp((h) => ({ ...h, reason: e.target.value, error: "" }))}
                placeholder="e.g. Amount is ₹1,450"
                style={{ height: "auto", minHeight: 84, padding: "10px 12px", fontSize: 15, resize: "vertical", borderColor: help.error ? "#f04438" : undefined }} />
                            {help.error && <Note>{help.error}</Note>}
            </label>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function CashSheet({ conn, me, claims = [], advances = [], cashAdvances = null, today = new Date(), onClose, onSaved, desk }) {
  const L = useMemo(() => ledger(claims, advances, cashAdvances), [claims, advances, cashAdvances]);
  const owed = L.over;
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const amt = Number(amount) || 0;
  const submit = async () => {
    if (!amt) return setError("Enter the amount");
    if (what.trim().length < 3) return setError("Say what it is for");
    setError("");
    let name;
    try {
      setBusy("Sending…");
      // up the approval chain (16 Nov 2026); the CEO's approval makes it Verified
      name = (await requestCashThroughChain(conn, { amount: amt, purpose: what.trim() }))?.id;
    } catch (e) {
      setBusy("");
      return setError(e.message);
    }
    invalidateClaims(conn, me.id);
    setBusy("");
    setDone({ name });
  };
  const close = () => (done ? onSaved?.({ name: done.name, message: "Advance requested" }) : onClose?.());
  const footer = done ? (
    <button type="button" className="ec-cta" onClick={close} style={{ ...btn.primary, flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Done</button>
  ) : (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ fontSize: 12, color: "#5b6576" }}>Request</span><b style={{ fontSize: 22, letterSpacing: "-0.02em", ...tabNum }}>{inr(amt)}</b></div>
      <button type="button" className="ec-cta" disabled={!!busy} onClick={submit} style={{ ...btn.primary, height: 48, padding: "0 22px", borderRadius: 14, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>{busy ? <><Spinner size={14} />{busy}</> : "Request"}</button>
    </>
  );
  return (
    <Sheet title={done ? "" : "Request advance"} sub={done ? null : `In hand now: ${inr(L.balance)}`} onClose={close} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {done ? <Done title="Advance requested" amount={amt} sub={what.trim()} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: desk ? "16px 24px 20px" : "12px 16px 18px" }}>
          {/* Verified is final for now (nothing booked); Accounts settle what is owed
              later, so it is not something to ask for as cash. */}
          {owed > 0 && <Note tone="info">{inr(owed)} already owed to you.</Note>}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Amount</span>
            <span className="ecs-in" style={{ display: "flex", alignItems: "center", gap: 8, height: 58 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#475467" }}>₹</span>
              <input inputMode="decimal" placeholder="0" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 22, fontWeight: 800, ...tabNum }} />
            </span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>What for</span>
            <input className="ecs-in" placeholder="e.g. CME camp in Madurai" value={what} maxLength={140} onChange={(e) => setWhat(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#f7f8fa" }}>
            <span style={{ color: "#7c3aed", display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.wallet} size={18} /></span>
            <span style={{ fontSize: 13, color: "#5b6576", lineHeight: 1.45 }}>Managers approve, then Accounts pay.</span>
          </div>
          {error && <Note>{error}</Note>}
        </div>
      )}
    </Sheet>
  );
}
