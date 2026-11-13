"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addClaimComment, adjustTripTA, applyAction, decideCarRequest, decideTrip, fetchCarQueue, fetchClaimDepartments, fetchClaimVisits, fetchMe, fetchQueue, makeConn, saveSanctioned, withTripMarks } from "./data/claimsApi";
import { tripsOf } from "./fieldTrips";
import { loggedUser } from "../support-report/data/erpClient";
import { effectiveSeat, loadSeatTemplates } from "@calendar/lib/boSeat";
import { MON, dateOf, inr, shortDate, spanOf, typeColor } from "./model";
import { BillThumb, CSS, Chip, FONT_HREF, FilePreview, IC, Icon, Note, RiskBadge, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

/* Expense claims waiting on the signed-in person, and the buttons to move
 * them on. One component, two jobs:
 *
 *   The planner's monthly field TA/DA claims are shown day by day (isField,
 *   FieldBody); every other claim as before.
 *
 *   mode "approve"  reporting officer: claims in "Waiting for Approval" whose
 *                   expense_approver is them -> Approve / Reject (with a
 *                   reason). After Approve the ERP routes it: AI score 90+
 *                   is verified and goes to payroll, the rest go to review.
 *   mode "verify"   verifier (Sathishkumar): claims "In Review" -> may lower
 *                   a row's sanctioned amount, then Verify (payroll entry is
 *                   made) or Reject.
 *   mode "auto"     the views the signed-in person has, from their token:
 *                   everyone gets "To approve"; the verifiers (verifiers
 *                   prop) also get "To verify"; the IT role profile gets
 *                   BOTH as an overview -- every waiting claim, not just
 *                   their own -- and may act only where the ERP lets them
 *                   (a claim's own approver approves, a verifier verifies).
 *   ?view=approve / ?view=verify (the ring nav tiles) picks the tab.
 *
 * Everything is done as the signed-in user with their own ERP token; the
 * ERP's workflow decides whether they may (only the claim's approver can
 * approve it, only the verifier can verify). */

const MODES = {
  approve: { state: "Waiting for Approval", title: "Claims to approve", yes: "Approve", empty: "Nothing waiting for your approval." },
  verify: { state: "In Review", title: "Claims to verify", yes: "Verify", empty: "Nothing waiting to be verified." },
  // what was already decided -- approved (on to the final check / payroll) or
  // sent back -- read-only, newest first
  history: { states: ["Approved", "In Review", "Verified", "Rejected"], title: "History", empty: "Nothing decided yet." },
};
const HISTORY_MAX = 60;

function useWidth(ref) {
  const [w, setW] = useState(1024);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export const VERIFIERS = ["sathish.admin@elbrit.org"];

/* The planner's monthly field TA/DA claim (12 Nov 2026): one per rep per
 * month, remark "Field TA/DA · 2026-10". Its Travel and Daily Allowance lines
 * were priced by the ERP's own Field Expense build, so they carry no bill; its
 * Stay / Food / Fuel / Toll lines carry a bill that was checked when scanned
 * (type, date inside the trip, readable, not a repeat) and scored by the AI
 * checker. The officer's Approve is FINAL -- straight to next month's payroll
 * -- when every bill line scored 90+; a possible repeat (85) or an unscored
 * bill still goes to Accounts after it ("Expense Claim Route"). */
const FIELD = "Field TA/DA \u00b7 ";
export const isField = (c) => String(c?.remark || "").startsWith(FIELD);
const fieldMonth = (c) => {
  const m = String(c.remark).slice(FIELD.length, FIELD.length + 7);
  return /^\d{4}-\d{2}$/.test(m) ? `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "";
};
/* A field claim's bills, each counted ONCE (a hotel bill is one line per
   night): checked, handwritten (typed in by the rep -- scored 70, but it is not
   a repeat), a possible repeat (checked, under 90), not checked yet.
   final: every bill checked, nothing to look at (bulk-approvable). */
function fieldCheck(c) {
  const once = new Map();
  for (const l of c.lines) if (l.bill && !once.has(l.bill)) once.set(l.bill, l);
  const bills = [...once.values()];
  const handBill = (l) => /· handwritten: /.test(l.note || "") || /entered by hand/i.test(l.ai?.reason || "");
  const hand = bills.filter(handBill);
  const flagged = bills.filter((l) => !handBill(l) && l.ai && l.ai.score != null && l.ai.score < 90);
  const unchecked = bills.filter((l) => !handBill(l) && !l.ai);
  return { bills: bills.length, hand: hand.length, flagged, unchecked: unchecked.length, final: !flagged.length && !unchecked.length && !hand.length };
}
const payrollMonth = () => MON[(new Date().getMonth() + 1) % 12];
// "TA · Thu 22 Oct · Bangalore → Tumkur" -> "Bangalore → Tumkur" (the day is the group's header)
const dayNote = (note) => String(note || "").replace(/^(TA|DA) · [^·]+ · /, "");

export default function ClaimApprovals({ url, token, mode = "auto", verifiers = VERIFIERS, overviewRoleProfile = "IT", className, onCountChange }) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const desk = w >= 900;
  const conn = useMemo(() => {
    try {
      return url && token ? makeConn({ url, token }) : null;
    } catch {
      return null;
    }
  }, [url, token]);

  const [lists, setLists] = useState({ status: "loading" });
  // The ring nav tiles link here with ?view=approve / ?view=verify.
  const [tab, setTab] = useState(() => {
    if (mode !== "auto") return mode;
    const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
    return v === "verify" ? "verify" : v === "cars" ? "cars" : v === "history" ? "history" : "approve";
  });
  const [fromLink] = useState(() => typeof window !== "undefined" && /[?&]view=/.test(window.location.search));
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!conn) return setLists({ status: "idle" });
    setLists((s) => ({ ...s, status: s.approve || s.verify ? "ready" : "loading" }));
    try {
      const me = await loggedUser(conn);
      const [profile] = await Promise.all([
        fetchMe(conn).then((e) => e.roleProfile).catch(() => ""),
        loadSeatTemplates({ url: conn.endpointUrl, token: conn.authToken }),
      ]);
      // A back-office seat (BO-IT-SFSM1) counts as its role template ("IT").
      const overview = !!overviewRoleProfile && effectiveSeat(profile) === overviewRoleProfile;
      const verifier = (verifiers || []).includes(me);
      // A reporting officer keeps read access to claims they approved, so
      // "In Review" is only ever listed for the verifiers and the overview.
      const want = mode === "auto" ? ["approve", ...(verifier || overview ? ["verify"] : []), "history"] : [mode];
      const out = { overview, verifier };
      await Promise.all(
        want.map(async (m) => {
          let q;
          if (m === "history") {
            // each decided state, the officer's own (the overview: everyone's), newest first
            const all = await Promise.all(
              MODES.history.states.map((state) =>
                fetchQueue(conn, { state, approver: overview ? null : me }).catch((e) => {
                  out.historyError = e.message;
                  return [];
                }),
              ),
            );
            q = all.flat().filter((c) => !c.isAdvance).sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, HISTORY_MAX);
          } else {
            q = await fetchQueue(conn, { state: MODES[m].state, approver: m === "approve" && !overview ? me : null }).catch((e) => {
              out[m + "Error"] = e.message;
              return [];
            });
          }
          // the team (claim department) of each, and a field claim's trips
          // with the officer's decision on each (12 Nov 2026)
          const depts = await fetchClaimDepartments(conn, q.filter((c) => !isField(c)).map((c) => c.id));
          out[m] = await Promise.all(q.map((c) => (isField(c) ? withTripMarks(conn, c) : { ...c, department: depts[c.id] || "" })));
        }),
      );
      // own-car requests (12 Nov 2026): the GM's queue, when this person decides them
      if (mode === "auto") {
        const cars = await fetchCarQueue(conn).catch(() => null);
        if (cars) {
          out.cars = cars.pending;
          out.carsRecent = cars.recent;
        }
      }
      setLists({ status: "ready", me, ...out });
    } catch (e) {
      setLists({ status: "error", error: e.message });
    }
  }, [conn, mode, verifiers, overviewRoleProfile]);

  useEffect(() => { load(); }, [load, tick]);

  const visible = mode === "auto" ? ["approve", ...(lists.verify ? ["verify"] : []), ...(lists.cars ? ["cars"] : []), "history"] : [mode];
  useEffect(() => {
    if (lists.status === "ready" && mode === "auto" && ((tab === "verify" && !lists.verify) || (tab === "cars" && !lists.cars))) setTab("approve");
  }, [lists, tab, mode]);
  const [openCar, setOpenCar] = useState(null);
  // Who may act on a claim: approve = its own approver; verify = a verifier.
  const canAct = (c, kind) => (kind === "history" ? false : kind === "verify" ? !!lists.verifier : !!lists.me && c.approver === lists.me);
  useEffect(() => {
    // Jump to the tab with work -- unless the link asked for a view.
    if (mode !== "auto" || lists.status !== "ready" || fromLink) return;
    if (!(lists[tab] || []).length && (lists[tab === "approve" ? "verify" : "approve"] || []).length) setTab(tab === "approve" ? "verify" : "approve");
  }, [lists, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = mode === "auto" ? tab : mode;
  const cars = current === "cars";
  const claims = useMemo(() => (cars ? [] : lists[current] || []), [cars, lists, current]);
  useEffect(() => {
    onCountChange?.((lists.approve || []).length + (lists.verify || []).length + (lists.cars || []).length);
  }, [lists, onCountChange]);

  // the accordion: search, open / closed (each key flips its default), the bill preview
  const [preview, setPreview] = useState(null); // { file, files }
  const [q, setQ] = useState("");
  const [forced, setForced] = useState(null); // "all" | "none" | null
  const [flip, setFlip] = useState(() => new Set());
  const toggle = (k) => setFlip((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openOf = (k, def) => (flip.has(k) ? !(forced ? forced === "all" : def) : forced ? forced === "all" : def);
  const expandAll = (on) => { setForced(on ? "all" : "none"); setFlip(new Set()); };
  // team (the claim's department) -> employee -> claims, after the search
  // employee by employee (their team shown on the row), after the search
  const people = useMemo(() => teamsOf(claims, q).flatMap((t) => t.people.map((x) => ({ ...x, team: t.name }))).sort((a, b) => a.name.localeCompare(b.name)), [claims, q]);
  const total = claims.reduce((s, c) => s + c.claimed, 0);
  // ready to approve in bulk: a field claim whose bills all passed their
  // check (or that has none) and no trip rejected, any other claim the AI
  // rated low risk
  const lowRisk = claims.filter((c) => canAct(c, current) && (isField(c) ? fieldCheck(c).final && !tripsOf(c.lines).some((t) => t.decision === "rejected") : c.ai?.risk === "Low"));

  const say = (m, tone = "ok") => {
    setToast({ m, tone });
    setTimeout(() => setToast(null), 3500);
  };
  const done = (m) => {
    setOpen(null);
    setPicked(new Set());
    say(m);
    setTick((t) => t + 1);
  };

  const bulkApprove = async () => {
    const ids = [...picked];
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        const c = claims.find((x) => x.id === id);
        if (c && isField(c) && current === "approve") await finish(c);
        else await applyAction(conn, id, MODES[current].yes);
        ok += 1;
      } catch (e) {
        failed.push(`${id}: ${e.message}`);
      }
    }
    if (failed.length) say(`${ok} done, ${failed.length} failed -- ${failed[0]}`, "error");
    else done(`${ok} ${ok === 1 ? "claim" : "claims"} ${current === "approve" ? "approved" : "verified"}`);
    setTick((t) => t + 1);
  };

  /* ---- trip by trip (12 Nov 2026): the officer decides each trip of a field
     claim on its own, then finishes the claim: Approve when every trip is
     approved, Send back when one is rejected. ---- */
  const patchClaim = (id, fn) =>
    setLists((s) => ({ ...s, approve: (s.approve || []).map((c) => (c.id === id ? fn(c) : c)), verify: (s.verify || []).map((c) => (c.id === id ? fn(c) : c)) }));
  const WORD = { approved: "Approved", rejected: "Rejected", pending: "" };
  const decide = async (c, trip, decision, note = "") => {
    await decideTrip(conn, { claim: c.id, rows: trip.lines.map((l) => l.id), decision: WORD[decision], note, trip: tripLabel(trip) });
    const ids = new Set(trip.lines.map((l) => l.id));
    const at = new Date().toISOString();
    patchClaim(c.id, (cl) => ({
      ...cl,
      lines: cl.lines.map((l) => (ids.has(l.id) ? { ...l, decision: WORD[decision], decisionNote: note, decidedBy: decision === "pending" ? "" : lists.me, decidedOn: decision === "pending" ? "" : at } : l)),
    }));
  };
  // the officer changes a TA line's amount, with a reason (13 Nov 2026)
  const adjust = async (c, line, amount, reason) => {
    await adjustTripTA(conn, { claim: c.id, lines: [{ row: line.id, amount }], reason });
    const back = Math.abs(amount - line.amount) < 0.5;
    patchClaim(c.id, (cl) => ({
      ...cl,
      lines: cl.lines.map((l) => (l.id === line.id ? { ...l, adjusted: !back, final: back ? l.amount : amount, adjustReason: back ? "" : reason, adjustedBy: back ? "" : lists.me } : l)),
    }));
  };
  // Approve (pending trips approved first) or, with a trip rejected, send it back
  const finish = async (c) => {
    const trips = tripsOf(c.lines);
    const no = trips.filter((t) => t.decision === "rejected");
    const who = c.employeeName || c.id;
    if (no.length) {
      await addClaimComment(conn, c.id, `Sent back -- ${no.map((t) => `${tripLabel(t)}: ${t.note || "rejected"}`).join("; ")}. The other trips stay approved.`);
      await applyAction(conn, c.id, "Reject");
      return `${who}: sent back — ${no.length} ${no.length === 1 ? "trip" : "trips"} to fix, the rest stay approved`;
    }
    for (const t of trips.filter((x) => x.decision === "pending")) {
      try {
        await decide(c, t, "approved");
      } catch (e) {
        // an ERP without trip-by-trip approval: the claim is approved as one
        if (!/not set up/i.test(e.message)) throw e;
        break;
      }
    }
    await applyAction(conn, c.id, "Approve");
    return `${who} approved — ${inr(c.claimed)} goes for the final check, then into payroll`;
  };

  const pad = desk ? 28 : 14;
  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%", minHeight: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      <main style={{ padding: pad, display: "flex", flexDirection: "column", gap: 14, maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: desk ? 24 : 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{mode === "auto" ? "Expense approvals" : MODES[mode].title}</span>
            <span style={{ fontSize: 13, color: "#5b6576" }}>
              {lists.status !== "ready"
                ? " "
                : cars
                  ? `${(lists.cars || []).length} car ${(lists.cars || []).length === 1 ? "request" : "requests"} waiting · ${inr((lists.cars || []).reduce((s, r) => s + r.asked, 0))} asked`
                  : `${claims.length} ${claims.length === 1 ? "claim" : "claims"} · ${inr(total)}`}
            </span>
          </div>
          <button type="button" className="ec-ghost" onClick={() => setTick((t) => t + 1)} style={{ ...btn.ghost, height: 38, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon d={IC.hist} size={15} />Refresh</button>
        </header>

        {mode === "auto" && (
          <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start" }}>
            {visible.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={tab === m} onClick={() => { setTab(m); setPicked(new Set()); }} style={{ height: 36, padding: "0 14px", borderRadius: 9, border: 0, background: tab === m ? "#fff" : "transparent", boxShadow: tab === m ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {m === "approve" ? "To approve" : m === "verify" ? "To verify" : m === "history" ? "History" : "Car requests"} <span style={{ color: "#8a93a3" }}>{(lists[m] || []).length}</span>
              </button>
            ))}
          </div>
        )}

        {lists.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user&rsquo;s token.</Note>}
        {lists.status === "error" && <Note>{lists.error}</Note>}
        {lists[current + "Error"] && <Note>{lists[current + "Error"]}</Note>}
        {lists.status === "loading" && <div aria-busy="true" style={{ ...card, height: 180, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

        {lists.status === "ready" && cars && <CarQueue pending={lists.cars || []} recent={lists.carsRecent || []} desk={desk} onOpen={setOpenCar} />}

        {lists.status === "ready" && !cars && (
          <>
            {current === "history" && claims.length > 0 && (
              <Note tone="info">What you already decided, newest first (the last {HISTORY_MAX}). Approved claims go on to the final check and payroll; a claim sent back is with the employee until they send it again.</Note>
            )}
            {claims.length > 0 && current !== "history" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {lowRisk.length > 0 && (
                  <button type="button" className="ec-ghost" onClick={() => setPicked(new Set(lowRisk.map((c) => c.id)))} style={{ ...btn.ghost, height: 36, fontSize: 13 }}>
                    Select {lowRisk.length} ready
                  </button>
                )}
                {picked.size > 0 && <>
                  <button type="button" className="ec-cta" onClick={bulkApprove} style={{ ...btn.primary, height: 36, fontSize: 13 }}>{MODES[current].yes} {picked.size} selected</button>
                  <button type="button" className="ec-ghost" onClick={() => setPicked(new Set())} style={{ ...btn.ghost, height: 36, fontSize: 13 }}>Clear</button>
                </>}
              </div>
            )}
            {!claims.length && <div style={{ ...card, padding: "36px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{MODES[current].empty}</div>}
            {claims.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ flex: desk ? "0 1 320px" : "1 1 100%", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec" }}>
                  <Icon d={IC.search} size={15} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" aria-label="Search employee" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 13.5 }} />
                </label>
                <span style={{ flex: 1 }} />
                <button type="button" className="ec-ghost" onClick={() => expandAll(true)} style={{ ...btn.ghost, height: 34, fontSize: 12.5 }}>Expand all</button>
                <button type="button" className="ec-ghost" onClick={() => expandAll(false)} style={{ ...btn.ghost, height: 34, fontSize: 12.5 }}>Collapse all</button>
              </div>
            )}
            {claims.length > 0 && !people.length && <div style={{ ...card, padding: "24px 16px", textAlign: "center", fontSize: 13.5, color: "#5b6576" }}>No one matches &ldquo;{q}&rdquo;.</div>}
            {people.map((p) => (
                  <PersonSection
                    key={p.id}
                    person={p}
                    open={openOf(`p:${p.id}`, people.length === 1)}
                    onToggle={() => toggle(`p:${p.id}`)}
                    desk={desk}
                  >
                    {p.claims.map((c) =>
                      isField(c) && (current === "approve" || current === "history") ? (
                        <FieldClaimPanel
                          key={c.id}
                          conn={conn}
                          claim={c}
                          history={current === "history"}
                          canAct={canAct(c, current)}
                          desk={desk}
                          picked={picked.has(c.id)}
                          canPick={lowRisk.includes(c)}
                          onPick={(on) => setPicked((s) => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n; })}
                          openOf={openOf}
                          toggle={toggle}
                          onDecide={decide}
                          onAdjust={adjust}
                          onFinish={async () => { const m = await finish(c); done(m); }}
                          onBill={(file, files) => setPreview({ file, files })}
                          onFull={() => setOpen(c)}
                        />
                      ) : (
                        <QueueCard key={c.id} claim={c} canPick={canAct(c, current)} picked={picked.has(c.id)} onPick={(on) => setPicked((s) => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n; })} onOpen={() => setOpen(c)} />
                      ),
                    )}
                  </PersonSection>
            ))}
          </>
        )}
      </main>

      {open && <ReviewSheet conn={conn} claim={claims.find((c) => c.id === open.id) || open} kind={current} canAct={canAct(open, current)} desk={desk} onClose={() => setOpen(null)} onDone={done} finish={finish} />}
      {preview && <FilePreview conn={conn} file={preview.file} files={preview.files} onClose={() => setPreview(null)} />}
      {openCar && <CarSheet conn={conn} req={openCar} desk={desk} onClose={() => setOpenCar(null)} onDone={(m) => { setOpenCar(null); done(m); }} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: desk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.tone === "error" ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500 }}>{toast.m}</div>
      )}
    </div>
  );
}

/* ------------------------- team / employee / trip ------------------------- */

/* The approval list as an accordion: team (the claim's department) ->
   employee -> claim; a planner field claim -> trip -> day, each trip with
   its own Approve / Reject and the bills as pictures (12 Nov 2026). */

const spanLabel = (from, to) => (from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);
const tripLabel = (t) => `${t.name ? `${t.name} · ` : ""}${spanLabel(t.from, t.to)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const DONE = ["Approved", "In Review", "Verified", "Paid"];
// a claim already decided: its trips without their own decision take the claim's
const claimWord = (c) => (DONE.includes(c.status) ? "approved" : c.status === "Rejected" ? "rejected" : "pending");
const tripDecision = (c, t) => (t.decision === "pending" ? claimWord(c) : t.decision);

function statsOf(p) {
  const st = { amount: 0, approved: 0, rejected: 0, pending: 0, bills: 0, flags: 0 };
  for (const c of p.claims) {
    st.amount += c.claimed;
    if (isField(c)) {
      for (const t of tripsOf(c.lines)) st[tripDecision(c, t)] += 1;
      const fc = fieldCheck(c);
      st.bills += fc.bills;
      if (c.status === "Waiting for Approval") st.flags += fc.flagged.length + fc.unchecked + fc.hand;
    } else st[claimWord(c)] += 1;
  }
  return { ...p, ...st };
}

/* where a decided claim is now, in words */
function historyText(c) {
  const when = c.modified ? ` · ${shortDate(String(c.modified).slice(0, 10))}` : "";
  const first = String(c.employeeName || "the employee").split(" ")[0];
  if (c.status === "Rejected") return `Sent back to ${first}${when} — with them until they fix it and send it again.`;
  if (c.status === "Approved") return `Approved${when} — waiting for the final check (Accounts / the CEO), then payroll.`;
  if (c.status === "In Review") return `Approved${when} — Accounts are checking it.`;
  return `Finalised${when} — in payroll${c.payrollEntry ? ` (${c.payrollEntry})` : ""}.`;
}

function teamsOf(claims, q) {
  const needle = String(q || "").trim().toLowerCase();
  const teams = new Map();
  for (const c of claims) {
    const team = c.department || "Other";
    const name = c.employeeName || c.employee || "—";
    if (needle && !`${name} ${c.employee || ""} ${team}`.toLowerCase().includes(needle)) continue;
    if (!teams.has(team)) teams.set(team, new Map());
    const people = teams.get(team);
    const k = c.employee || name;
    if (!people.has(k)) people.set(k, { id: k, name, claims: [] });
    people.get(k).claims.push(c);
  }
  return [...teams.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, people]) => {
      const ps = [...people.values()].sort((a, b) => a.name.localeCompare(b.name)).map(statsOf);
      const sum = (k) => ps.reduce((s, p) => s + p[k], 0);
      return { name, people: ps, amount: sum("amount"), approved: sum("approved"), rejected: sum("rejected"), pending: sum("pending"), bills: sum("bills"), flags: sum("flags") };
    });
}

function Chevron({ open }) {
  return (
    <span aria-hidden style={{ flex: "none", width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: open ? "#eef3fe" : "#f2f4f7", color: open ? "#1d4ed8" : "#475467", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
      <Icon d={IC.next} size={15} />
    </span>
  );
}

/* approved / rejected / to decide, as a bar and in words */
function Progress({ st, unit = "trip", wide }) {
  const all = st.approved + st.rejected + st.pending;
  if (!all) return null;
  const seg = (n, c) => (n ? <span style={{ flex: n, background: c }} /> : null);
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: wide ? 0 : 170, flex: wide ? 1 : "none" }}>
      <span style={{ display: "flex", height: 6, borderRadius: 99, overflow: "hidden", background: "#eaecf0", gap: 2 }}>
        {seg(st.approved, "#12b76a")}
        {seg(st.rejected, "#f04438")}
        {seg(st.pending, "#fdb022")}
      </span>
      <span style={{ fontSize: 11.5, color: "#5b6576", ...ell }}>
        {[st.approved && `${st.approved} approved`, st.rejected && `${st.rejected} rejected`, st.pending && `${st.pending} to decide`].filter(Boolean).join(" · ")}
        <span style={{ color: "#98a2b3" }}> · {plural(all, unit)}</span>
      </span>
    </span>
  );
}

const DECISION = {
  approved: ["Approved", "#ecfdf3", "#067647"],
  rejected: ["Rejected", "#fef3f2", "#b42318"],
  pending: ["To decide", "#fffaeb", "#b54708"],
};
function DecisionPill({ d }) {
  const [t, bg, fg] = DECISION[d] || DECISION.pending;
  return <span style={{ flex: "none", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: bg, color: fg, whiteSpace: "nowrap" }}>{t}</span>;
}

function PersonSection({ person: p, open, onToggle, desk, children }) {
  const initials = p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div style={{ background: "#fff", borderRadius: 14, boxShadow: open ? "0 0 0 1px #b2c8f7, 0 4px 14px rgba(16,24,40,.06)" : "0 0 0 1px #e4e7ec", overflow: "hidden" }}>
      <button type="button" aria-expanded={open} onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: desk ? "12px 16px" : "10px 12px", border: 0, background: "transparent", cursor: "pointer", textAlign: "left", flexWrap: desk ? "nowrap" : "wrap" }}>
        <Chevron open={open} />
        <span aria-hidden style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", background: "#eef3fe", color: "#1d4ed8", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800 }}>{initials || "?"}</span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, ...ell }}>{p.name}</span>
          <span style={{ fontSize: 12, color: "#5b6576", ...ell }}>
            {p.team && p.team !== "Other" ? `${p.team} · ` : ""}{plural(p.claims.length, "claim")}{p.bills ? ` · ${plural(p.bills, "bill")}` : ""}{p.flags ? ` · ${p.flags} to look at` : ""}
          </span>
        </span>
        {desk && <Progress st={p} />}
        <b style={{ fontSize: 15, ...tabNum }}>{inr(p.amount)}</b>
        {!desk && <span style={{ width: "100%", display: "flex" }}><Progress st={p} wide /></span>}
      </button>
      {open && <div style={{ borderTop: "1px solid #eef0f3", padding: desk ? 12 : 8, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
    </div>
  );
}

/* a handwritten bill (12 Nov 2026): typed in by the rep because it could not
   be read -- it carries the rep's reason and (asked for) a payment proof */
// the planner writes them into the line: "… · handwritten: <reason> · proof: <file url>"
const handOf = (l) => {
  const note = String(l.note || "");
  const why = (note.match(/· handwritten: ([^·]*)/) || [])[1];
  const proof = (note.match(/· proof: (\S+)/) || [])[1];
  return { why: why ? why.trim() : "", proof: proof || "", cash: /· paid in cash/.test(note) };
};
const isHand = (l) => !!(l.bill && (/· handwritten: /.test(l.note || "") || /entered by hand/i.test(l.ai?.reason || "")));

/* a bill's check in two words, and its colour */
const checkOf = (ai) =>
  !ai ? ["not checked", "#b54708"]
    : /entered by hand/i.test(ai.reason || "") ? ["handwritten", "#b54708"]
      : ai.score != null && ai.score < 90 ? ["possible repeat", "#b42318"]
        : ["checked", "#067647"];

/* a trip's bills, once each (a hotel bill is one line per night) */
function billsOf(t) {
  const m = new Map();
  for (const l of t.lines) {
    if (!l.bill) continue;
    const h = handOf(l);
    if (!m.has(l.bill)) m.set(l.bill, { url: l.bill, file: billFile(l.bill), type: l.type, dates: [], amount: 0, ai: l.ai, hand: isHand(l), why: h.why, proof: h.proof ? billFile(h.proof) : null, cash: h.cash });
    const b = m.get(l.bill);
    b.dates.push(l.date);
    b.amount += l.amount;
  }
  return [...m.values()];
}

/* One planner field claim (the rep's month): its trips, each decided on its
   own, then one button to finish the claim. */
function FieldClaimPanel({ conn, claim: c, canAct, history, desk, picked, canPick, onPick, openOf, toggle, onDecide, onAdjust, onFinish, onBill, onFull }) {
  const trips = tripsOf(c.lines).map((t) => (history ? { ...t, decision: tripDecision(c, t) } : t));
  // each day's visits, per town (the rep's Field Expense Day, through the ERP)
  const [visits, setVisits] = useState({});
  useEffect(() => {
    let alive = true;
    fetchClaimVisits(conn, c.id).then((v) => alive && setVisits(v || {}));
    return () => {
      alive = false;
    };
  }, [conn, c.id]);
  // the claim after the officer's TA changes
  const total = c.lines.reduce((s, l) => s + (Number(l.adjusted ? l.final : l.amount) || 0), 0);
  const changed = Math.abs(total - c.claimed) >= 0.5;
  const handBills = new Set(c.lines.filter(isHand).map((l) => l.bill)).size;
  // a pending trip with a handwritten bill is approved on its own, after its confirm
  const handPending = trips.filter((t) => t.decision === "pending" && t.lines.some(isHand)).length;
  const fc = fieldCheck(c);
  const n = { approved: 0, rejected: 0, pending: 0 };
  for (const t of trips) n[t.decision] += 1;
  const days = new Set(c.lines.map((l) => l.date)).size;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Approve / Send back asks first (13 Nov 2026): nothing moves until "Yes"
  const [confirming, setConfirming] = useState(false);
  const first = String(c.employeeName || "the employee").split(" ")[0];
  // travel days with few visits, to name in the confirm
  const lowDays = [...new Set(c.lines.map((l) => l.date))].filter((d) => lowVisitDay(visits, d, c.lines.filter((l) => l.date === d))).length;
  const finish = async () => {
    setError("");
    setConfirming(false);
    setBusy(true);
    try {
      await onFinish();
    } catch (e) {
      setBusy(false);
      setError(/modified after/i.test(e.message) ? "The claim changed meanwhile. Refresh and try again." : e.message);
    }
  };
  const finishText = n.rejected
    ? `Send back to ${first} · ${plural(n.rejected, "trip")} to fix`
    : handPending
      ? `Approve the handwritten ${handPending === 1 ? "trip" : "trips"} first`
    : n.pending === trips.length
      ? `Approve all ${plural(trips.length, "trip")} · ${inr(total)}`
      : n.pending
        ? `Approve the other ${plural(n.pending, "trip")} · ${inr(total)}`
        : `Approve claim · ${inr(total)}`;
  return (
    <div style={{ borderRadius: 12, background: picked ? "#f5f8ff" : "#fcfcfd", boxShadow: picked ? "0 0 0 1px #b2c8f7" : "0 0 0 1px #eaecf0", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: desk ? "10px 14px" : "10px 10px", flexWrap: "wrap" }}>
        {canPick && canAct && <input type="checkbox" aria-label={`Select ${c.id}`} checked={picked} onChange={(e) => onPick(e.target.checked)} style={{ width: 17, height: 17, accentColor: "#2563eb", flex: "none" }} />}
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#eef3fe", color: "#1d4ed8" }}>Field TA/DA · {fieldMonth(c)}</span>
        {history ? <Chip claim={c} /> : <FieldCheckBadge fc={fc} />}
        {handBills > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#fffaeb", color: "#b54708", boxShadow: "inset 0 0 0 1px #fedf89" }}>✍ {handBills} handwritten</span>}
        <span style={{ fontSize: 12, color: "#5b6576", ...ell }}>{plural(trips.length, "trip")} · {plural(days, "day")}</span>
        <span style={{ flex: 1 }} />
        {changed && <s style={{ fontSize: 13, color: "#98a2b3", ...tabNum }}>{inr(c.claimed)}</s>}
        <b style={{ fontSize: 16, ...tabNum }}>{inr(total)}</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: desk ? "0 14px 12px" : "0 8px 10px" }}>
        {trips.map((t) => (
          <TripRow
            key={t.key}
            conn={conn}
            trip={t}
            claim={c}
            canAct={canAct && !busy}
            desk={desk}
            // every trip opens by itself, so its days are read without a click (13 Nov 2026)
            open={openOf(`r:${c.id}:${t.key}`, true)}
            onToggle={() => toggle(`r:${c.id}:${t.key}`)}
            onDecide={onDecide}
            onAdjust={onAdjust}
            visits={visits}
            onBill={onBill}
          />
        ))}
      </div>
      {error && <div style={{ padding: "0 14px 10px" }}><Note>{error}</Note></div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: desk ? "10px 14px" : "10px", borderTop: "1px solid #eef0f3" }}>
        <span style={{ flex: "1 1 220px", fontSize: 12.5, color: "#5b6576", lineHeight: 1.4 }}>
          {history
            ? historyText(c)
            : !canAct
            ? `Waiting on ${c.approver || "the reporting officer"}.`
            : n.rejected
              ? `${first} gets the claim back with your reasons; the approved trips stay approved, so next time you only check what changed.`
              : ""}
        </span>
        <button type="button" className="ec-ghost" onClick={onFull} style={{ ...btn.ghost, height: 38, fontSize: 13 }}>Full view</button>
        {canAct && !confirming && (
          <button
            type="button"
            className="ec-cta"
            disabled={busy || (!n.rejected && handPending > 0)}
            title={!n.rejected && handPending > 0 ? "Approve the trip with the handwritten bill first — it asks you to confirm you checked it" : undefined}
            onClick={() => setConfirming(true)}
            style={{ ...btn.primary, height: 38, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8, ...(n.rejected ? { background: "#d92d20" } : {}) }}
          >
            {busy ? <><Spinner />{n.rejected ? "Sending back…" : "Approving…"}</> : finishText}
          </button>
        )}
      </div>
      {/* the confirm: what happens, then Cancel / Yes */}
      {canAct && confirming && (
        <div style={{ margin: desk ? "0 14px 12px" : "0 10px 10px", padding: 12, borderRadius: 10, background: n.rejected ? "#fef3f2" : "#eff4ff", boxShadow: `inset 0 0 0 1px ${n.rejected ? "#fecdca" : "#c7d7fe"}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ fontSize: 14, color: "#101828" }}>
            {n.rejected
              ? `Send ${first}'s claim back? ${plural(n.rejected, "trip")} to fix.`
              : `Approve ${first}'s ${fieldMonth(c)} claim · ${inr(total)}?`}
          </b>
          <span style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.45 }}>
            {n.rejected
              ? `${first} sees your reasons and fixes the rejected ${n.rejected === 1 ? "trip" : "trips"}; the approved trips stay approved.`
              : `${n.pending ? `${plural(n.pending, "trip")} not decided yet will be approved with it. ` : ""}It then goes for the final check (Accounts / the CEO) and into the ${payrollMonth()} payroll.`}
            {!n.rejected && lowDays > 0 && <b style={{ color: "#b54708" }}> ⚠ {plural(lowDays, "travel day")} with {LOW_VISITS} visits or fewer.</b>}
            {!n.rejected && changed && <> TA changed by you: {inr(c.claimed)} → {inr(total)}.</>}
          </span>
          <span style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="ec-ghost" onClick={() => setConfirming(false)} style={{ ...btn.ghost, height: 36, fontSize: 13 }}>Cancel</button>
            <button type="button" className="ec-cta" onClick={finish} style={{ ...btn.primary, height: 36, fontSize: 13, ...(n.rejected ? { background: "#d92d20" } : {}) }}>
              {n.rejected ? "Yes, send back" : `Yes, approve · ${inr(total)}`}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/* A line in words an approver reads at once: what it is (the route, the
   hotel, the pump) and one grey detail -- built per type from the line's note
   (the planner writes "Type · Day · what · detail"). -> { main, sub } */
const DAY_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/;
const unshout = (t) => (/[a-z]/.test(t) || !/[A-Z]{3}/.test(t) ? t : t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
const rs = (n) => inr(Number(String(n).replace(/[^\d.]/g, "")) || 0);
const isTopUp = (l) => l.type === "Daily Allowance" && /top-up/i.test(l.note || "");
function lineText(l) {
  const note = String(l.note || "");
  const parts = note.split(" · ").map((x) => x.trim()).filter(Boolean);
  const rest = parts.slice(1).filter((x) => !DAY_RE.test(x));
  const capped = (note.match(/capped[^·]*/) || [])[0];
  const capText = capped ? (/approved ₹([\d,]+)/.test(capped) ? `capped at the approved ${rs(capped.match(/approved ₹([\d,]+)/)[1])}` : /full DA ₹([\d,]+)/.test(capped) ? `capped at the day's full DA ${rs(capped.match(/full DA ₹([\d,]+)/)[1])}` : capped) : "";
  const vendor = l.ai?.vendor ? unshout(l.ai.vendor) : "";
  if (l.type === "Travel") return { main: rest[0] || "Travel", sub: rest.slice(1).join(" · ") };
  if (l.type === "Fuel" || l.type === "Toll") {
    return { main: vendor || (l.type === "Fuel" ? "Fuel bill" : "Toll receipt"), sub: ["Own car", capText].filter(Boolean).join(" · ") };
  }
  if (l.type === "Stay") {
    const m = note.match(/(\d+) of (\d+) (working )?nights of a ₹([\d,]+) bill/);
    return { main: unshout(rest[0] || vendor || "Hotel"), sub: [m ? `${m[3] ? "working " : ""}night ${m[1]} of ${m[2]} · bill ${rs(m[4])}` : "", capText].filter(Boolean).join(" · ") };
  }
  if (l.type === "Food") return { main: unshout(rest[0] && !/^capped/.test(rest[0]) ? rest[0] : vendor || "Food bill"), sub: capText };
  if (isTopUp(l)) {
    const m = note.match(/₹([\d,]+) raised to 50 % of the day's DA \(₹([\d,]+)\)/);
    return { main: "Top-up to 50 % DA", sub: m ? `stay + food ${rs(m[1])} → ${rs(m[2])}` : "" };
  }
  if (l.type === "Daily Allowance") {
    const m = note.match(/50 % of ₹([\d,]+)/);
    return { main: `Daily allowance${rest[0] ? ` · ${rest[0]}` : ""}`, sub: m ? `50 % of ${rs(m[1])} · no stay / food bill` : "" };
  }
  return { main: rest[0] || l.type, sub: rest.slice(1).join(" · ") };
}
const TA_TYPES = ["Travel", "Fuel", "Toll"];
/* A day with travel and this many visits or fewer is flagged to the officer
   (13 Nov 2026): the travel was paid for fewer calls than expected. */
const LOW_VISITS = 4;
const lowVisitDay = (visits, date, ls) => {
  const v = visits[date];
  return !!v && ls.some((l) => TA_TYPES.includes(l.type)) && (v.visits || 0) <= LOW_VISITS;
};
const ORDER = { Travel: 0, Fuel: 1, Toll: 2, "Daily Allowance": 3, Stay: 4, Food: 5 };

function TripRow({ conn, trip: t, claim: c, canAct, desk, open, onToggle, onDecide, onAdjust, visits = {}, onBill }) {
  const [rejecting, setRejecting] = useState(false);
  // changing a TA line: { id, amount, reason }
  const [editTa, setEditTa] = useState(null);
  const canEditTa = canAct && t.decision === "pending" && !!onAdjust;
  const saveTa = async (l) => {
    setError("");
    const amount = Math.round(Number(editTa.amount));
    if (!(amount >= 0)) return setError("Enter the TA amount.");
    // only down: never above what was claimed (13 Nov 2026)
    if (amount > l.amount) return setError(`The TA can only be reduced — at most ${inr(l.amount)}, the amount claimed.`);
    if (Math.abs(amount - l.amount) >= 0.5 && editTa.reason.trim().length < 3) return setError("Say why the TA is changed — the employee sees this.");
    setBusy(`ta-${l.id}`);
    try {
      await onAdjust(c, l, amount, editTa.reason.trim());
      setEditTa(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const bills = billsOf(t);
  // the preview walks the bills and, after a handwritten one, its payment proof
  const files = bills.flatMap((b) => (b.proof ? [b.file, b.proof] : [b.file]));
  const hand = bills.filter((b) => b.hand);
  const [confirmHand, setConfirmHand] = useState(false);
  const go = async (decision, note = "") => {
    setError("");
    if (decision === "rejected" && !note.trim()) return setError("Say why this trip is rejected.");
    setBusy(decision);
    try {
      await onDecide(c, t, decision, note.trim());
      setRejecting(false);
      setReason("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const tone = { approved: "#12b76a", rejected: "#f04438", pending: "#fdb022" }[t.decision];
  const flagged = bills.filter((b) => checkOf(b.ai)[0] !== "checked").length;
  const days = [];
  const at = new Map();
  for (const l of t.lines) {
    if (!at.has(l.date)) {
      at.set(l.date, []);
      days.push([l.date, at.get(l.date)]);
    }
    at.get(l.date).push(l);
  }
  const small = { height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
  const lowDays = days.filter(([date, ls]) => lowVisitDay(visits, date, ls)).length;
  return (
    <div style={{ background: "#fff", borderRadius: 10, boxShadow: `0 0 0 1px #e4e7ec, inset 3px 0 0 ${tone}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 13px", flexWrap: desk ? "nowrap" : "wrap" }}>
        <button type="button" aria-expanded={open} onClick={onToggle} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <Chevron open={open} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, ...ell }}>{t.name ? <>{t.name} <span style={{ fontWeight: 500, color: "#5b6576" }}>· {spanLabel(t.from, t.to)}</span></> : spanLabel(t.from, t.to)}</span>
            <span style={{ fontSize: 11.5, color: "#5b6576", ...ell }}>
              {plural(t.days, "day")} · {plural(t.lines.length, "line")}
              {bills.length ? ` · ${plural(bills.length, "bill")}` : " · no bills"}
              {hand.length ? <span style={{ color: "#b54708", fontWeight: 700 }}> · ✍ {hand.length} handwritten</span> : null}
              {flagged ? <span style={{ color: "#b54708", fontWeight: 600 }}> · {flagged} to look at</span> : null}
              {lowDays ? <span style={{ color: "#b54708", fontWeight: 700 }}> · ⚠ {plural(lowDays, "day")} with few visits</span> : null}
            </span>
          </span>
          <DecisionPill d={t.decision} />
          <b style={{ fontSize: 14, ...tabNum }}>{inr(t.amount)}</b>
        </button>
        {canAct && !rejecting && (
          <span style={{ display: "flex", gap: 6, flex: "none", marginLeft: desk ? 0 : "auto" }}>
            {t.decision === "pending" ? (
              <>
                <button type="button" disabled={!!busy} onClick={() => { setRejecting(true); if (!open) onToggle(); }} style={{ ...small, border: "1px solid #fecdca", background: "#fff", color: "#b42318" }}>Reject</button>
                <button type="button" disabled={!!busy} onClick={() => (hand.length && !confirmHand ? (setConfirmHand(true), !open && onToggle()) : go("approved"))} style={{ ...small, border: 0, background: "#16a34a", color: "#fff" }}>
                  {busy === "approved" ? <Spinner /> : <Icon d={IC.check} size={14} />}Approve
                </button>
              </>
            ) : (
              <button type="button" disabled={!!busy} onClick={() => go("pending")} style={{ ...small, border: "1px solid #d0d5dd", background: "#fff", color: "#344054" }}>
                {busy === "pending" ? <Spinner /> : null}Undo
              </button>
            )}
          </span>
        )}
      </div>
      {hand.length > 0 && (
        <div style={{ margin: "0 10px 8px 13px", padding: "8px 10px", borderRadius: 8, background: "#fffaeb", boxShadow: "inset 0 0 0 1px #fedf89", color: "#7a2e0e", fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
          <b style={{ fontSize: 12.5 }}>✍ {hand.length === 1 ? "A handwritten bill" : `${hand.length} handwritten bills`} — no printed bill. Compare each photo with its payment proof before approving.</b>
          {hand.map((b) => (
            <span key={b.url}>
              {b.type} · {b.dates.length > 1 ? spanLabel([...b.dates].sort()[0], [...b.dates].sort()[b.dates.length - 1]) : shortDate(b.dates[0])} · {inr(b.amount)}
              {b.why ? <> — <i>&ldquo;{b.why}&rdquo;</i></> : null}
              {!b.proof && (b.cash ? <b style={{ color: "#344054" }}> · 💵 paid in cash</b> : <b style={{ color: "#b42318" }}> · no payment proof added</b>)}
            </span>
          ))}
          {confirmHand && canAct && t.decision === "pending" && (
            <span style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
              <button type="button" disabled={!!busy} onClick={() => setConfirmHand(false)} style={{ ...small, border: "1px solid #d0d5dd", background: "#fff", color: "#344054" }}>Cancel</button>
              <button type="button" disabled={!!busy} onClick={() => go("approved")} style={{ ...small, border: 0, background: "#16a34a", color: "#fff" }}>
                {busy === "approved" ? <Spinner /> : <Icon d={IC.check} size={14} />}I checked them — approve trip
              </button>
            </span>
          )}
        </div>
      )}
      {t.decision === "rejected" && t.note && (
        <div style={{ margin: "0 10px 8px 13px", padding: "6px 10px", borderRadius: 8, background: "#fef3f2", color: "#912018", fontSize: 12.5 }}>
          <b>Why:</b> {t.note}
        </div>
      )}
      {rejecting && (
        <div style={{ margin: "0 10px 10px 13px", display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? e.g. 22 Oct: no visit that day" style={{ width: "100%", borderRadius: 10, border: "1px solid #fda29b", padding: 10, fontSize: 13.5, resize: "vertical" }} />
          <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...small, border: "1px solid #d0d5dd", background: "#fff", color: "#344054" }}>Cancel</button>
            <button type="button" disabled={!!busy} onClick={() => go("rejected", reason)} style={{ ...small, border: 0, background: "#d92d20", color: "#fff" }}>{busy === "rejected" ? <Spinner /> : null}Reject trip</button>
          </span>
        </div>
      )}
      {error && <div style={{ margin: "0 10px 8px 13px" }}><Note>{error}</Note></div>}
      {open && (
        <div style={{ borderTop: "1px solid #f2f4f7", padding: desk ? "12px 16px 14px" : "10px 10px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* the trip's bills, once each, in one row -- press one to read it */}
          {bills.length > 0 && (
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 2 }}>
              {bills.map((b) => {
                const [word, color] = checkOf(b.ai);
                const ds = [...b.dates].sort();
                return [
                  <BillThumb
                    key={b.url}
                    conn={conn}
                    file={b.file}
                    w={92}
                    h={112}
                    caption={`${b.type} · ${ds.length > 1 ? spanLabel(ds[0], ds[ds.length - 1]) : shortDate(ds[0])}`}
                    // the amount; the check in words only when it needs a look (the border's colour says the rest)
                    sub={`${inr(b.amount)}${b.hand ? " · handwritten" : word === "possible repeat" ? " · repeat?" : ""}`}
                    tone={color === "#067647" ? undefined : color}
                    onOpen={() => onBill(b.file, files)}
                  />,
                  b.hand &&
                    (b.proof ? (
                      <BillThumb key={`${b.url}-proof`} conn={conn} file={b.proof} w={92} h={112} caption="Payment proof" sub={`for the ${b.type.toLowerCase()} bill`} tone="#b54708" onOpen={() => onBill(b.proof, files)} />
                    ) : (
                      <span key={`${b.url}-noproof`} style={{ flex: "none", width: 92, height: 112, borderRadius: 10, border: `1.5px dashed ${b.cash ? "#d0d5dd" : "#fda29b"}`, display: "grid", placeItems: "center", textAlign: "center", padding: 6, fontSize: 11, fontWeight: 700, color: b.cash ? "#344054" : "#b42318", background: b.cash ? "#f9fafb" : "#fffbfa" }}>
                        {b.cash ? "💵 Paid in cash" : "No payment proof"}
                      </span>
                    )),
                ];
              })}
            </div>
          )}
          {/* day by day: one line each -- the route or the shop, its detail below, the amount */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {days.map(([date, ls]) => {
              const dt = dateOf(date);
              return (
                <div key={date} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".02em", color: "#475467", textTransform: "uppercase" }}>{DOW[dt.getDay()]} {dt.getDate()} {MON[dt.getMonth()]}</span>
                    <span style={{ flex: 1, height: 1, background: "#f2f4f7", alignSelf: "center" }} />
                    {(() => {
                      const eff = (l) => (l.adjusted ? l.final : l.amount);
                      const ta = ls.filter((l) => TA_TYPES.includes(l.type)).reduce((s, l) => s + eff(l), 0);
                      const da = ls.reduce((s, l) => s + eff(l), 0) - ta;
                      return (
                        <span style={{ fontSize: 12, color: "#667085", ...tabNum }}>
                          {ta > 0 && <>TA <b style={{ color: "#344054" }}>{inr(ta)}</b></>}
                          {ta > 0 && da > 0 && " · "}
                          {da > 0 && <>DA <b style={{ color: "#344054" }}>{inr(da)}</b></>}
                          {ta > 0 && da > 0 && <b style={{ color: "#101828", marginLeft: 8 }}>{inr(ta + da)}</b>}
                        </span>
                      );
                    })()}
                  </div>
                  {/* the day's visits, town by town -- what the travel was for */}
                  {visits[date] && (visits[date].visits > 0 || lowVisitDay(visits, date, ls)) && (
                    <span style={{ fontSize: 12, color: "#475467", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {lowVisitDay(visits, date, ls) ? (
                        <b style={{ color: "#b54708", background: "#fffaeb", boxShadow: "inset 0 0 0 1px #fedf89", padding: "1px 8px", borderRadius: 99 }} title={`A travel day with ${LOW_VISITS} visits or fewer`}>
                          ⚠ {visits[date].visits ? `Only ${plural(visits[date].visits, "visit")}` : "No visits"} · fewer than expected
                        </b>
                      ) : (
                        <b style={{ color: "#1d4ed8" }}>{plural(visits[date].visits, "visit")}</b>
                      )}
                      {Object.entries(visits[date].places || {})
                        .sort((x, y) => y[1] - x[1])
                        .map(([town, k]) => (
                          <span key={town} style={{ padding: "1px 7px", borderRadius: 99, background: "#f2f4f7", fontWeight: 600 }}>
                            {unshout(town).replace(/^\w/, (ch) => ch.toUpperCase())} {k}
                          </span>
                        ))}
                    </span>
                  )}
                  {/* TA first, then DA: stay, food, and the top-up made from them last */}
                  {[...ls].sort((x, y) => (isTopUp(x) ? 6 : ORDER[x.type] ?? 9) - (isTopUp(y) ? 6 : ORDER[y.type] ?? 9)).map((l) => {
                    const col = typeColor(l.type);
                    const b = l.bill ? bills.find((x) => x.url === l.bill) : null;
                    const [word, color] = b ? checkOf(l.ai) : [];
                    const { main, sub } = lineText(l);
                    const loud = b && (word === "handwritten" || word === "possible repeat");
                    return (
                      <div key={l.id} style={{ display: "grid", gridTemplateColumns: "54px minmax(0,1fr) auto", columnGap: 10, alignItems: "start" }}>
                        <span style={{ height: 20, lineHeight: "20px", textAlign: "center", borderRadius: 6, background: col.bg, color: col.fg, fontSize: 11, fontWeight: 700 }}>{isTopUp(l) ? "DA +" : l.type === "Daily Allowance" ? "DA" : l.type}</span>
                        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2939", ...ell }}>{main}</span>
                            {b && (
                              <button type="button" onClick={() => onBill(b.file, files)} title={`See the bill · ${word}`} aria-label={`See the bill (${word})`} style={{ flex: "none", width: 22, height: 22, borderRadius: 6, border: `1px solid ${color === "#067647" ? "#d0d5dd" : color}`, background: "#fff", color: color === "#067647" ? "#475467" : color, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
                                <Icon d={IC.file} size={13} />
                              </button>
                            )}
                            {loud && <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color }}>{word}</span>}
                          </span>
                          {sub && <span style={{ fontSize: 11.5, color: "#667085", ...ell }}>{sub}</span>}
                          {l.adjusted && (
                            <span style={{ fontSize: 11.5, color: "#b54708" }}>
                              TA changed {inr(l.amount)} → {inr(l.final)}
                              {l.adjustReason ? <> — <i>&ldquo;{l.adjustReason}&rdquo;</i></> : null}
                            </span>
                          )}
                          {editTa?.id === l.id && (
                            <span style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, padding: 8, borderRadius: 8, background: "#f9fafb", boxShadow: "inset 0 0 0 1px #eaecf0" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#475467" }}>TA to pay</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff" }}>
                                  <span style={{ color: "#8a93a3" }}>₹</span>
                                  <input autoFocus inputMode="numeric" value={editTa.amount} onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d]/g, "");
                                      // typing above the claimed amount stops at it
                                      setEditTa({ ...editTa, amount: v && Number(v) > l.amount ? String(Math.round(l.amount)) : v });
                                    }} aria-label="TA amount" style={{ width: 90, border: 0, outline: 0, background: "transparent", fontSize: 14, fontWeight: 700, ...tabNum }} />
                                </span>
                                <span style={{ fontSize: 11.5, color: "#667085" }}>claimed {inr(l.amount)} · can only be reduced</span>
                              </span>
                              <input value={editTa.reason} onChange={(e) => setEditTa({ ...editTa, reason: e.target.value })} placeholder="Why? e.g. bus fare is ₹150 on this route" aria-label="Why the TA is changed" style={{ height: 34, borderRadius: 8, border: "1px solid #d0d5dd", padding: "0 10px", fontSize: 13 }} />
                              <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button type="button" disabled={!!busy} onClick={() => { setEditTa(null); setError(""); }} style={{ ...small, height: 30, border: "1px solid #d0d5dd", background: "#fff", color: "#344054" }}>Cancel</button>
                                <button type="button" disabled={!!busy} onClick={() => saveTa(l)} style={{ ...small, height: 30, border: 0, background: "#2563eb", color: "#fff" }}>{busy === `ta-${l.id}` ? <Spinner /> : null}Save TA</button>
                              </span>
                            </span>
                          )}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {l.adjusted && <s style={{ fontSize: 12, color: "#98a2b3", ...tabNum }}>{inr(l.amount)}</s>}
                          <span style={{ fontSize: 13, fontWeight: 700, ...tabNum }}>{inr(l.adjusted ? l.final : l.amount)}</span>
                          {canEditTa && l.type === "Travel" && editTa?.id !== l.id && (
                            <button type="button" title="Change the TA" aria-label="Change the TA" onClick={() => setEditTa({ id: l.id, amount: String(Math.round(l.adjusted ? l.final : l.amount)), reason: l.adjustReason || "" })} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #d0d5dd", background: "#fff", color: "#475467", display: "grid", placeItems: "center", cursor: "pointer", padding: 0, fontSize: 12 }}>
                              ✎
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ car requests ------------------------------ */

/* Own-car requests waiting on the GM (Car Request, 12 Nov 2026), and the ones
 * decided in the last 30 days. */
const carDays = (r) => Math.round((new Date(r.to) - new Date(r.from)) / 86400000) + 1;
const carSpan = (r) => (r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} – ${shortDate(r.to)}`);

function CarQueue({ pending, recent, desk, onOpen }) {
  return (
    <>
      {!pending.length && <div style={{ ...card, padding: "36px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No car request waiting.</div>}
      {pending.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(340px,1fr))" : "minmax(0,1fr)", gap: 8 }}>
          {pending.map((r) => (
            <button key={r.id} type="button" onClick={() => onOpen(r)} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6, border: 0, textAlign: "left", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, ...ell }}>{r.employeeName}</span>
                <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(r.asked)}</span>
              </span>
              <span style={{ fontSize: 12.5, color: "#5b6576", ...ell }}>
                {carSpan(r)} · {carDays(r)} {carDays(r) === 1 ? "day" : "days"} · {r.km} km
              </span>
              <span style={{ fontSize: 12.5, color: "#344054", ...ell }}>{r.places}</span>
              {r.suggested > 0 && r.suggested !== r.asked && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#b54708" }}>Suggested {inr(r.suggested)} — asked {inr(r.asked)}</span>}
            </button>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <section style={{ ...card, padding: desk ? "14px 16px" : 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>Decided · last 30 days</span>
          {recent.map((r) => (
            <span key={r.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0, ...ell }}>{r.employeeName} · {carSpan(r)}</span>
              <span style={{ fontWeight: 700, color: r.status === "approved" ? "#067647" : "#b42318", ...tabNum }}>
                {r.status === "approved" ? `Approved ${inr(r.approvedAmount)}` : "Rejected"}
              </span>
            </span>
          ))}
        </section>
      )}
    </>
  );
}

/* One request: the trip, the estimate, and the GM's decision -- approve
 * (the amount may be changed) or reject (with the reason the rep sees). */
function CarSheet({ conn, req: r, desk, onClose, onDone }) {
  const [amount, setAmount] = useState(String(r.asked || ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const amt = Math.round(Number(amount) || 0);
  const go = async (decision) => {
    setError("");
    if (decision === "Approve" && !(amt > 0)) return setError("Enter the amount you approve.");
    if (decision === "Reject" && !note.trim()) return setError("Say why it is rejected.");
    try {
      setBusy(decision === "Approve" ? "Approving…" : "Rejecting…");
      await decideCarRequest(conn, r.id, decision, decision === "Approve" ? amt : "", note.trim());
      onDone(decision === "Approve" ? `Car approved for ${r.employeeName} — up to ${inr(amt)}` : `Car request of ${r.employeeName} rejected`);
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  };
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f2f4f7", fontSize: 13.5 }}>
      <span style={{ color: "#5b6576", flex: "none" }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <Sheet
      title={`${r.employeeName} · own car`}
      sub={`${carSpan(r)} · ${carDays(r)} ${carDays(r) === 1 ? "day" : "days"} · ${r.id}`}
      onClose={busy ? () => {} : onClose}
      maxWidth={desk ? 620 : 640}
      body="#f4f5f7"
      footer={rejecting ? <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
        <button type="button" disabled={!!busy} onClick={() => go("Reject")} style={{ ...btn.primary, flex: 1.4, background: "#d92d20", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Reject request"}</button>
      </> : <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Reject</button>
        <button type="button" className="ec-cta" disabled={!!busy || !(amt > 0)} onClick={() => go("Approve")} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Spinner />{busy}</> : `Approve ${inr(amt)}`}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...card, padding: "4px 14px" }}>
          {row("Route", r.places || "—")}
          {row("Distance", `${r.km} km`)}
          {row("Fuel price", r.km > 0 && r.fuelCost > 0 ? `₹${Math.round((r.fuelCost * 15) / r.km)}/l` : "—")}
          {row("Fuel estimate", `${inr(r.fuelCost)} · ${r.km} km ÷ 15 km/l`)}
          {r.tolls > 0 && row("Toll estimate (asked before)", inr(r.tolls))}
          {row("Suggested", inr(r.suggested))}
          {row("Asked", inr(r.asked))}
        </div>
        {!rejecting && (
          <label style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={label}>Approve up to · change it if needed</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, height: 42, padding: "0 12px", borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff" }}>
              <span style={{ color: "#8a93a3" }}>₹</span>
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} aria-label="Amount approved" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 16, fontWeight: 700, ...tabNum }} />
            </span>
            <span style={{ fontSize: 12, color: "#5b6576" }}>Fuel bills are paid as billed up to this amount (tolls are not paid); with no bill the normal fare is paid.</span>
          </label>
        )}
        <label style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>{rejecting ? "Why" : "Remarks · optional"}</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={rejecting ? "e.g. Train is available on this route -- go by train" : "e.g. Approved for the multi-town tour"} style={{ width: "100%", borderRadius: 10, border: "1px solid #d0d5dd", padding: 10, fontSize: 14, resize: "vertical" }} />
        </label>
        {error && <Note>{error}</Note>}
      </div>
    </Sheet>
  );
}

function QueueCard({ claim: c, canPick, picked, onPick, onOpen }) {
  const byType = {};
  for (const l of c.lines) byType[l.type] = (byType[l.type] || 0) + l.amount;
  const field = isField(c);
  const fc = field ? fieldCheck(c) : null;
  const days = field ? new Set(c.lines.map((l) => l.date)).size : 0;
  const missingBills = c.isAdvance || field ? 0 : c.lines.filter((l) => !l.bill).length;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, background: picked ? "#eef3fe" : "#f7f8fa", boxShadow: picked ? "0 0 0 1px #b2c8f7" : "none" }}>
      {canPick ? <input type="checkbox" aria-label={`Select ${c.id}`} checked={picked} onChange={(e) => onPick(e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, accentColor: "#2563eb", flex: "none" }} /> : <span style={{ width: 17, flex: "none" }} />}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7, border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {field ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#eef3fe", color: "#1d4ed8" }}>Field TA/DA · {fieldMonth(c)}</span>
                <FieldCheckBadge fc={fc} />
              </>
            ) : (
              <>
                {c.isAdvance ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f4f0ff", color: "#5b21b6" }}>Advance</span> : <RiskBadge ai={c.ai} small />}
                {!c.isAdvance && !c.ai && <span style={{ fontSize: 11, fontWeight: 600, color: "#8a93a3" }}>Not checked by AI</span>}
              </>
            )}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(c.claimed)}</span>
        </span>
        {!canPick && c.status === "Waiting for Approval" && c.approver && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#b54708", ...ell }}>Waiting on {c.approver}</span>}
        <span style={{ fontSize: 12, color: "#5b6576", ...ell }}>
          {field
            ? `${days} ${days === 1 ? "day" : "days"} · ${spanOf(c.lines)} · ${c.id}`
            : `${c.id} · ${spanOf(c.lines)} · ${c.lines.length} ${c.lines.length === 1 ? "row" : "rows"}${c.advanceOf ? ` · from ${c.advanceOf}` : ""}`}
        </span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(byType).map(([t, v]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 7, background: typeColor(t).bg, color: typeColor(t).fg, fontSize: 11.5, fontWeight: 600 }}>{t} <span style={{ color: "#0b1220", ...tabNum }}>{inr(v)}</span></span>
          ))}
          {missingBills > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#b42318" }}>{missingBills} without bill</span>}
        </span>
      </button>
    </div>
  );
}

/* A field claim's bills at a glance: all checked / a possible repeat / not
   checked yet / no bills. */
function FieldCheckBadge({ fc }) {
  const [text, bg, fg] = !fc.bills
    ? ["No bills · TA/DA only", "#f2f4f7", "#475467"]
    : fc.final
      ? [`${fc.bills} ${fc.bills === 1 ? "bill" : "bills"} checked`, "#ecfdf3", "#067647"]
      : fc.flagged.length
        ? [`${fc.flagged.length} possible repeat`, "#fffaeb", "#b54708"]
        : fc.unchecked
          ? [`${fc.unchecked} ${fc.unchecked === 1 ? "bill" : "bills"} not checked`, "#fffaeb", "#b54708"]
          : // only handwritten bills to look at: their own "✍ handwritten" badge says so
            [`${fc.bills - fc.hand} of ${fc.bills} ${fc.bills === 1 ? "bill" : "bills"} checked`, "#f2f4f7", "#475467"];
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* A field claim, day by day: each day's TA, DA and bills, with what the bill
   check found and the bill itself. */
function FieldBody({ claim: c, verify, canAct, sanctioned, setSanctioned, onBill }) {
  const byType = {};
  for (const l of c.lines) byType[l.type] = (byType[l.type] || 0) + l.amount;
  const days = [];
  const at = new Map();
  for (const l of [...c.lines].sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx)) {
    if (!at.has(l.date)) {
      at.set(l.date, []);
      days.push([l.date, at.get(l.date)]);
    }
    at.get(l.date).push(l);
  }
  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(byType).map(([t, v]) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 8, background: typeColor(t).bg, color: typeColor(t).fg, fontSize: 12.5, fontWeight: 600 }}>
            {t} <b style={{ color: "#0b1220", ...tabNum }}>{inr(v)}</b>
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", height: 28, padding: "0 10px", fontSize: 12.5, color: "#5b6576" }}>{days.length} {days.length === 1 ? "day" : "days"}</span>
      </div>
      {days.map(([date, ls]) => {
        const dt = dateOf(date);
        return (
          <div key={date} style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{DOW[dt.getDay()]} {dt.getDate()} {MON[dt.getMonth()]}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 14, fontWeight: 700, ...tabNum }}>{inr(ls.reduce((s, l) => s + l.amount, 0))}</span>
            </div>
            {ls.map((l) => {
              const col = typeColor(l.type);
              const bill = billFile(l.bill);
              const flagged = l.ai && l.ai.score != null && l.ai.score < 90;
              return (
                <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 10, boxShadow: `inset 3px 0 0 ${col.c}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 6, background: col.bg, color: col.fg, fontSize: 11.5, fontWeight: 700 }}>{l.type}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#344054" }}>{dayNote(l.note)}</span>
                    {verify && canAct ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, height: 32, width: 110, padding: "0 8px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff" }}>
                        <span style={{ color: "#8a93a3" }}>₹</span>
                        <input aria-label={`Sanction for ${l.type} on ${date}`} inputMode="decimal" value={sanctioned[l.id]} onChange={(e) => setSanctioned((s) => ({ ...s, [l.id]: e.target.value.replace(/[^\d.]/g, "") }))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 14, fontWeight: 700, textAlign: "right", ...tabNum }} />
                      </span>
                    ) : (
                      <span style={{ flex: "none", fontSize: 14, fontWeight: 700, ...tabNum }}>{inr(l.amount)}</span>
                    )}
                  </div>
                  {bill && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="ec-link" onClick={() => onBill(bill)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <Icon d={IC.eye} size={14} />View bill
                      </button>
                      <span style={{ fontSize: 12, fontWeight: 600, color: !l.ai || flagged ? "#b54708" : "#067647" }}>
                        {!l.ai ? "Not checked yet — look at the bill" : l.ai.reason}
                      </span>
                      {l.ai?.amount != null && l.ai.amount !== l.amount && <span style={{ fontSize: 12, color: "#5b6576" }}>bill {inr(l.ai.amount)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function ReviewSheet({ conn, claim: c, kind, canAct = true, desk, onClose, onDone, finish }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [sanctioned, setSanctioned] = useState(() => Object.fromEntries(c.lines.map((l) => [l.id, String(l.sanctioned || l.amount)])));
  const [preview, setPreview] = useState(null);
  const verify = kind === "verify";
  const field = isField(c);
  const fc = field ? fieldCheck(c) : null;
  const cut = c.lines.some((l) => Number(sanctioned[l.id]) !== l.amount);
  // a field claim is finished trip-aware: pending trips approved, or sent
  // back when a trip was rejected on the list
  const sendBack = field && !verify && tripsOf(c.lines).some((t) => t.decision === "rejected");
  const sanctionedTotal = c.lines.reduce((s, l) => s + (Number(sanctioned[l.id]) || 0), 0);

  const yes = async () => {
    setError("");
    try {
      if (verify && cut) {
        const bad = c.lines.find((l) => !(Number(sanctioned[l.id]) >= 0) || Number(sanctioned[l.id]) > l.amount);
        if (bad) return setError(`Row ${bad.idx}: the sanctioned amount must be between 0 and ${inr(bad.amount)}.`);
        setBusy("Saving amounts…");
        await saveSanctioned(conn, c, Object.fromEntries(Object.entries(sanctioned).map(([k, v]) => [k, Number(v)])));
      }
      if (field && !verify && finish) {
        setBusy(sendBack ? "Sending back…" : "Approving…");
        return onDone(await finish(c));
      }
      setBusy(verify ? "Verifying…" : "Approving…");
      await applyAction(conn, c.id, verify ? "Verify" : "Approve");
      onDone(
        field && !verify
          ? `${c.employeeName || c.id} approved — it goes for the final check, then into payroll`
          : `${c.id} ${verify ? "verified" : "approved"}`
      );
    } catch (e) {
      setBusy("");
      setError(/modified after/i.test(e.message) ? "The claim changed while it was open. Refresh and try again." : e.message);
    }
  };
  const no = async () => {
    if (!reason.trim()) return setError("Say why it is rejected -- the employee sees this.");
    setError("");
    try {
      setBusy("Rejecting…");
      await addClaimComment(conn, c.id, reason.trim());
      await applyAction(conn, c.id, "Reject");
      onDone(`${c.id} rejected`);
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  };

  return (
    <Sheet
      title={`${c.employeeName || c.employee} · ${inr(c.claimed)}`}
      chips={field ? <><Chip claim={c} /><FieldCheckBadge fc={fc} /></> : <><Chip claim={c} /><RiskBadge ai={c.ai} /></>}
      sub={field ? `Field TA/DA · ${fieldMonth(c)} · ${c.id}` : `${c.id} · ${spanOf(c.lines)}${c.posting ? " · filed " + shortDate(c.posting) : ""}`}
      onClose={busy ? () => {} : onClose}
      maxWidth={desk ? 900 : 640}
      body="#f4f5f7"
      footer={!canAct ? <>
        <span style={{ flex: 1, alignSelf: "center", fontSize: 13, color: "#5b6576" }}>{kind === "history" ? historyText(c) : verify ? "Only the verifier can verify this claim." : `Only ${c.approver || "the reporting officer"} can approve this claim.`}</span>
        <button type="button" className="ec-ghost" onClick={onClose} style={btn.ghost}>Close</button>
      </> : rejecting ? <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
        <button type="button" disabled={!!busy} onClick={no} style={{ ...btn.primary, flex: 1.4, background: "#d92d20", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Reject claim"}</button>
      </> : <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Reject</button>
        <button type="button" className="ec-cta" disabled={!!busy} onClick={yes} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Spinner />{busy}</> : verify ? `Verify ${inr(sanctionedTotal)}` : sendBack ? "Send back (trip rejected)" : field && fc.final ? `Approve ${inr(c.claimed)}` : "Approve"}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {field && !verify && (
          <Note tone={fc.final ? "ok" : "info"}>
            {/* 12 Nov 2026: the officer approves; the final check (Accounts / the
                CEO, on the field-expenses dashboard) finalises the month for payroll */}
            After you approve, {inr(c.claimed)} goes for the <b>final check</b> (Accounts / the CEO, on the field-expenses page), then into the {payrollMonth()} payroll. TA and DA were worked out by the ERP from the visits
            {fc.bills ? `; ${fc.bills} ${fc.bills === 1 ? "bill was" : "bills were"} checked when scanned` : ""}
            {fc.flagged.length ? ` · ${fc.flagged.length} possible repeat${fc.flagged.length > 1 ? "s" : ""}` : ""}
            {fc.unchecked ? ` · ${fc.unchecked} not checked yet` : ""}.
          </Note>
        )}
        {field && <FieldBody claim={c} verify={verify} canAct={canAct} sanctioned={sanctioned} setSanctioned={setSanctioned} onBill={setPreview} />}
        {!field && c.ai?.summary && <Note tone={c.ai.risk === "Low" ? "ok" : "info"}><b>Bill check:</b> {c.ai.summary}</Note>}
        {!field && !c.ai && !c.isAdvance && <Note tone="info">These bills have not been checked by the AI -- look at each one.</Note>}
        {!field && c.isAdvance && <Note tone="info">Advance request -- no bills yet. {verify ? "Verify once the money is released to them." : "Approving sends it to be released."}</Note>}
        {!field && c.advanceOf && <span style={{ fontSize: 12, fontWeight: 600, color: "#5b21b6" }}>Spent from advance {c.advanceOf} — covered by its balance first; only the rest is paid to them.</span>}
        {!field && c.remark && <span style={{ fontSize: 13, color: "#475467" }}><b style={{ fontWeight: 600 }}>Remark:</b> {c.remark}</span>}
        {!field && c.lines.map((l) => {
          const col = typeColor(l.type);
          const bill = billFile(l.bill);
          const dt = l.date ? dateOf(l.date) : null;
          return (
            <div key={l.id} style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 7, boxShadow: `0 0 0 1px #e4e7ec, inset 3px 0 0 ${col.c}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 7, background: col.bg, color: col.fg, fontSize: 12, fontWeight: 700 }}>{l.type}{l.sub ? ` · ${l.sub}` : ""}</span>
                {dt && <span style={{ fontSize: 12, color: "#5b6576" }}>{dt.getDate()} {MON[dt.getMonth()]}</span>}
                <RiskBadge ai={l.ai} small />
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(l.amount)}</span>
              </div>
              {l.note && <span style={{ fontSize: 13.5, color: "#344054" }}>{l.note}</span>}
              {l.ai && (
                <span style={{ fontSize: 12, color: "#475467", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>Bill: <b style={tabNum}>{l.ai.amount != null ? inr(l.ai.amount) : "—"}</b></span>
                  {l.ai.date && <span>dated {shortDate(l.ai.date)}</span>}
                  {l.ai.vendor && <span style={ell}>{l.ai.vendor}</span>}
                  <span style={{ color: l.ai.risk === "Low" ? "#067647" : "#b54708" }}>{l.ai.reason}</span>
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {bill ? (
                  <button type="button" className="ec-link" onClick={() => setPreview(bill)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", color: "#1d4ed8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Icon d={IC.eye} size={14} />View bill</button>
                ) : !c.isAdvance && <span style={{ fontSize: 12, fontWeight: 600, color: "#b42318" }}>No bill attached</span>}
                {verify && canAct && (
                  <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={label}>Sanction</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, height: 34, width: 120, padding: "0 8px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff" }}>
                      <span style={{ color: "#8a93a3" }}>₹</span>
                      <input inputMode="decimal" value={sanctioned[l.id]} onChange={(e) => setSanctioned((s) => ({ ...s, [l.id]: e.target.value.replace(/[^\d.]/g, "") }))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 14, fontWeight: 700, textAlign: "right", ...tabNum }} />
                    </span>
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {rejecting && (
          <label style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Why is it rejected? · the employee sees this</span>
            <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={field ? "e.g. 24 Oct: no visit that day -- take that trip out and send the month again" : "e.g. Fuel bill is for ₹400, not ₹500 -- please correct the amount"} style={{ width: "100%", borderRadius: 10, border: "1px solid #d0d5dd", padding: 10, fontSize: 14, resize: "vertical" }} />
          </label>
        )}
        {error && <Note>{error}</Note>}
      </div>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </Sheet>
  );
}
