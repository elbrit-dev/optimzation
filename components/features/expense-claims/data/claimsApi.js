/* Expense Claim reads and writes, as the signed-in user's own token.
 *
 * The ERP is the only source: claims are `Expense Claim` documents with their
 * `expenses` rows (Expense Claim Detail), and bills are `File` docs attached
 * to the claim. Nothing here approves, rejects or sanctions -- the app only
 * files claims and shows the status HR gives them in the ERP.
 *
 * The Employee role can create and edit Expense Claims, so a claim is written
 * by the person filing it (owner = them) and the ERP's own validation and
 * permissions apply. A minimal claim is employee + posting date + rows; the
 * ERP fills department, company, cost centre and each row's account from the
 * Expense Claim Type.
 *
 * Attachments live on the claim, not the row: the ERP has no per-row file
 * field. Private files cannot be fetched cross-origin (the ERP sends no CORS
 * header on the file GET), so previews go through /api/erp/claim-file, which
 * forwards the same user token -- the ERP still decides who may see a file. */

import { cached, evictCached, gql, loggedUser, makeConn as makeErpConn } from "../../support-report/data/erpClient";
import { pdfForReading } from "@calendar/lib/field-expenses/bill-reader";

export function makeConn({ url, token }) {
  try {
    return makeErpConn({ url, token });
  } catch (e) {
    throw new Error(String(e.message).replace("Support Report", "Expense claims"));
  }
}

const BASE_FIELDS = `
  name posting_date status docstatus approval_status modified remark employee_name
  total_claimed_amount total_sanctioned_amount total_amount_reimbursed grand_total
`;
const BASE_ROW = "name idx expense_date expense_type__name description amount sanctioned_amount";

/* The approval flow's fields (ERP, 21 Oct 2026): workflow state, approver,
   AI check, payroll link, advance tally, and each row's sub type, bill and
   AI reading. Asked for separately so that, should the ERP's GraphQL schema
   ever lack one of them, claims still load the old way (one bad field 400s a
   whole GraphQL query). */
const FLOW_FIELDS = `
  workflow_state__name expense_approver__name employee__name
  custom_ai_score custom_ai_risk custom_ai_summary custom_additional_salary__name
  custom_advance__name custom_advance_covered custom_advance_spent custom_advance_balance
`;
const FLOW_ROW = "custom_sub_type custom_bill custom_bill_amount custom_bill_date custom_bill_vendor custom_ai_score custom_ai_risk custom_ai_reason";

/* The running Miscellaneous claim (ERP, 27 Oct 2026): the claim's flag and
   each bill's own status and Accounts' note. Newest, so its own tier. */
const RUN_FIELDS = "custom_running";
const RUN_ROW = "custom_bill_status custom_review_note";

/* tier 2 = flow + running fields, 1 = flow fields, 0 = base only. */
const claimsQuery = (tier) => `
  query ExpenseClaimsOf($f: [DBFilterInput], $first: Int) {
    ExpenseClaims(first: $first, filter: $f, sortBy: { field: MODIFIED, direction: DESC }) {
      edges { node { ${BASE_FIELDS} ${tier ? FLOW_FIELDS : ""} ${tier > 1 ? RUN_FIELDS : ""} expenses { ${BASE_ROW} ${tier ? FLOW_ROW : ""} ${tier > 1 ? RUN_ROW : ""} } } }
    }
  }
`;
let fieldTier = 2;
async function queryClaims(conn, f, first) {
  let firstError;
  // Fewer fields each step: if a lower tier works, the fields it dropped were
  // the problem (the GraphQL schema lags new ERP fields until a cache clear)
  // -- stop asking for them this session. If all fail, the first error is
  // the real one.
  for (let tier = fieldTier; tier >= 0; tier--) {
    try {
      const d = await gql(conn, claimsQuery(tier), { f, first });
      if (tier < fieldTier) {
        console.warn(`[expense-claims] claim fields of tier ${tier + 1}+ unavailable, reading without them:`, firstError.message);
        fieldTier = tier;
      }
      return d;
    } catch (e) {
      firstError = firstError || e;
    }
  }
  throw firstError;
}

const ME_QUERY = `
  query ExpenseClaimEmployee($f: [DBFilterInput]) {
    Employees(first: 5, filter: $f) {
      edges { node { name employee_name status department__name designation__name company__name custom_role_profile__name } }
    }
  }
`;

const TYPES_QUERY = `query ExpenseClaimTypes { ExpenseClaimTypes(first: 100) { edges { node { name custom_sub_types custom_disabled custom_allow_new_sub_types } } } }`;
const TYPES_QUERY_BASE = `query ExpenseClaimTypes { ExpenseClaimTypes(first: 100) { edges { node { name } } } }`;

const FILES_QUERY = `
  query ExpenseClaimFiles($f: [DBFilterInput]) {
    Files(first: 50, filter: $f) { edges { node { name file_name file_url is_private file_size creation } } }
  }
`;

const SAVE_MUTATION = `
  mutation SaveExpenseClaim($doc: String!) {
    saveDoc(doctype: "Expense Claim", doc: $doc) { doc { name } }
  }
`;

const DELETE_FILE_MUTATION = `
  mutation DeleteClaimFile($name: String!) { deleteDoc(doctype: "File", name: $name) { name } }
`;

const UPLOAD_MUTATION = `
  mutation UploadClaimFile($file: Upload!, $attached_to_doctype: String, $attached_to_name: String, $is_private: Boolean) {
    uploadFile(file: $file, attached_to_doctype: $attached_to_doctype, attached_to_name: $attached_to_name, is_private: $is_private) {
      name file_url file_name
    }
  }
`;

const eq = (fieldname, value) => ({ fieldname, operator: "EQ", value });

/* Select fields come back as GraphQL enums ("UNPAID"); the page speaks the
   ERP's own words ("Unpaid"). */
const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());
const num = (v) => Number(v) || 0;

/* Claims in the approval flow carry its state (Draft, Waiting for Approval,
   In Review, Verified, Rejected); older, HR-submitted ones keep the ERP's
   own status (Unpaid, Paid, Cancelled). */
export const FLOW_STATES = ["Draft", "Waiting for Approval", "Approved", "In Review", "Verified", "Rejected"];
export const EDITABLE_STATES = ["Draft", "Rejected"];

function statusOf(node) {
  if (Number(node.docstatus) === 2) return "Cancelled";
  if (Number(node.docstatus) === 0 && node.workflow_state__name) return node.workflow_state__name;
  if (String(node.approval_status || "").toUpperCase() === "REJECTED") return "Rejected";
  const s = titleCase(node.status);
  return s || (Number(node.docstatus) === 0 ? "Draft" : "Submitted");
}

const riskWord = (v) => (v ? titleCase(v) : null);
/* An empty Percent reads back as 0 -- a row or claim is "checked" only when
   the AI wrote its reason / summary (same rule as the ERP's AI Guard). */
const scoreOf = (score, text) => (String(text || "").trim() ? num(score) : null);

export function shapeClaim(node) {
  const lines = (node.expenses || [])
    .map((r) => ({
      id: r.name,
      idx: num(r.idx),
      date: String(r.expense_date || "").slice(0, 10),
      type: r.expense_type__name || "Others",
      sub: r.custom_sub_type || "",
      note: String(r.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      amount: num(r.amount),
      sanctioned: num(r.sanctioned_amount),
      bill: r.custom_bill || "",
      // Running claim only: Checking / Verified / In Review / Rejected.
      state: r.custom_bill_status ? titleCase(String(r.custom_bill_status).replace(/_/g, " ")) : null,
      review: String(r.custom_review_note || "").trim(),
      ai: r.custom_ai_reason
        ? {
            score: scoreOf(r.custom_ai_score, r.custom_ai_reason),
            risk: riskWord(r.custom_ai_risk),
            reason: r.custom_ai_reason,
            amount: r.custom_bill_amount != null ? num(r.custom_bill_amount) : null,
            date: r.custom_bill_date || null,
            vendor: r.custom_bill_vendor || null,
          }
        : null,
    }))
    .sort((a, b) => a.idx - b.idx);
  const docstatus = num(node.docstatus);
  const status = statusOf(node);
  const isAdvance = lines.length > 0 && lines.every((l) => l.type === ADVANCE);
  return {
    id: node.name,
    posting: String(node.posting_date || "").slice(0, 10),
    status,
    docstatus,
    inFlow: !!node.workflow_state__name,
    editable: docstatus === 0 && (!node.workflow_state__name || EDITABLE_STATES.includes(status)),
    employee: node.employee__name || null,
    employeeName: node.employee_name || "",
    approver: node.expense_approver__name || null,
    claimed: num(node.total_claimed_amount) || lines.reduce((s, l) => s + l.amount, 0),
    // Only a submitted (old flow) or verified (new flow) claim's sanctioned
    // figure means anything -- before that it is whatever the draft holds.
    sanctioned: docstatus === 1 || status === "Verified" ? num(node.total_sanctioned_amount) || lines.reduce((s, l) => s + (l.sanctioned || l.amount), 0) : null,
    reimbursed: num(node.total_amount_reimbursed),
    // The employee's running Miscellaneous claim: open (docstatus 0) until the
    // next advance payment closes it; then what the advances did not cover is
    // owed to them (grand_total) until Accounts pays it.
    running: !!Number(node.custom_running),
    owed: docstatus === 1 ? Math.max(0, num(node.grand_total) - num(node.total_amount_reimbursed)) : 0,
    remark: String(node.remark || "").trim(),
    modified: node.modified,
    ai: node.custom_ai_summary ? { score: scoreOf(node.custom_ai_score, node.custom_ai_summary), risk: riskWord(node.custom_ai_risk), summary: node.custom_ai_summary } : null,
    payrollEntry: node.custom_additional_salary__name || null,
    isAdvance,
    advanceOf: node.custom_advance__name || null,
    advance: isAdvance ? { spent: num(node.custom_advance_spent), balance: num(node.custom_advance_balance) } : null,
    coveredByAdvance: num(node.custom_advance_covered),
    lines,
  };
}

export const ADVANCE = "Advance";

/* The signed-in person's Employee record, Active first so an old Left record
   on a recycled login never answers for them. `employee` (a docname) skips
   the login lookup when the page already knows who it is. */
export function fetchMe(conn, employee) {
  return cached(conn, `ec-me|${employee || ""}`, async () => {
    let filter;
    if (employee) filter = [eq("name", employee)];
    else {
      const email = await loggedUser(conn);
      if (!email) throw new Error("The ERP did not say who this token belongs to.");
      filter = [eq("user_id", email)];
    }
    const d = await gql(conn, ME_QUERY, { f: filter });
    const rows = (d.Employees?.edges || []).map((e) => e.node);
    const me = rows.sort((a, b) => (String(b.status).toUpperCase() === "ACTIVE") - (String(a.status).toUpperCase() === "ACTIVE"))[0];
    if (!me) throw new Error("No Employee record is linked to this login, so claims cannot be filed or listed.");
    return {
      id: me.name,
      name: me.employee_name || me.name,
      department: String(me.department__name || "").replace(/ - ELPL$/, ""),
      designation: me.designation__name || "",
      company: me.company__name || "",
      roleProfile: me.custom_role_profile__name || "",
    };
  });
}

/* Who gets claims (the home Settle strip and its camera, the profile tab, the
   Claims page), by the signed-in person's own Employee: their department
   (without " - ELPL") or their role profile. null = no limit on that side.
   28 Oct 2026: the IT department only (the IT team tries it first) -- not the
   "IT" role profile, which also sits on people in Marketing, HR, Accounts and
   MIS. Both null = every employee. */
export const CLAIMS_DEPARTMENTS = ["IT"];
/* "Request cash" (an Employee Advance). Off since 28 Oct 2026: prod ERP has
   bills up to verification only -- no advance set-up (its Task, the sales
   roles' permissions) and no settlement -- so a request would go nowhere.
   true brings the link and its form back. */
// 16 Nov 2026: on -- a cash request goes up the approval chain to the CEO
export const CASH_REQUESTS = true;
export const CLAIMS_ROLE_PROFILES = null;
/* app-uat only (16 Nov 2026): claims and settlement are open to EVERY login --
   each person sees their own, by their login. The same app-uat switch as the
   Expense approval tile: NEXT_PUBLIC_EXPENSE_APPROVALS_FOR_ALL is "1" on
   app-uat (apphosting.yaml) and "0" on live (apphosting.prod.yaml), so live
   keeps the IT department only. */
export const CLAIMS_FOR_ALL = process.env.NEXT_PUBLIC_EXPENSE_APPROVALS_FOR_ALL === "1";
export const canUseClaims = (me) =>
  !!me
  && (CLAIMS_FOR_ALL || (
    (!CLAIMS_DEPARTMENTS || CLAIMS_DEPARTMENTS.includes(String(me.department || "").trim()))
    && (!CLAIMS_ROLE_PROFILES || CLAIMS_ROLE_PROFILES.includes(String(me.roleProfile || "").trim()))));

export function fetchClaims(conn, employee) {
  const key = `ec-claims|${employee}`;
  return cached(conn, key, async () => {
    const [d, got] = await Promise.all([
      queryClaims(conn, [eq("employee", employee)], 1000),
      // the settlement bills: their own doctype since 23 Nov 2026. Unreadable
      // is an error the Settlements screen shows -- never "no bills"
      readSettlementBills(conn).catch((e) => {
        console.warn("[expense-claims] settlement bills unreadable:", e.message);
        return { error: e.message || "The bills could not be read." };
      }),
    ]);
    const nodes = (d.ExpenseClaims?.edges || []).map((e) => e.node);
    if (fieldTier < 2) await addRunningFields(conn, employee, nodes);
    // the old running settlement claim (an Expense Claim) is not settlement any
    // more: settlement left Expense Claim (23 Nov 2026)
    const claims = nodes.map(shapeClaim).filter((c) => !c.running);
    if (got.error) {
      claims.settlementError = got.error;
      // never kept: the next load reads the bills again
      evictCached(conn, key);
    } else if (got.bills.length) {
      // the bills are always the signed-in login's own: never shown under
      // someone else's Employee
      const owner = got.employee !== undefined ? got.employee : (await fetchMe(conn).catch(() => null))?.id;
      // beside the month claims, not one of them (it has its own screen):
      // model.ledger reads it from here, the claim history never sees it
      if (owner && owner === employee) claims.settlement = settlementClaim(got.bills, employee);
    }
    return claims;
  });
}

/* GraphQL without the running-claim fields (its schema lags new ERP fields
   until the site restarts): read them over REST, which sees them at once --
   else the open claim is invisible and every bill tries to start a new one. */
async function addRunningFields(conn, employee, nodes) {
  const q = new URLSearchParams({
    filters: JSON.stringify([["employee", "=", employee], ["custom_running", "=", 1]]),
    fields: JSON.stringify(["name"]),
    limit_page_length: "500",
  });
  // An ERP without the field yet (prod before its console run) has no running
  // claims: read on without them rather than fail the whole page.
  let found;
  try {
    found = (await rest(conn, `/api/resource/Expense%20Claim?${q}`)).data || [];
  } catch (e) {
    console.warn("[expense-claims] running claims unreadable on this ERP:", e.message);
    return;
  }
  const running = new Set(found.map((r) => r.name));
  await Promise.all(nodes.filter((n) => running.has(n.name)).map(async (n) => {
    const doc = (await rest(conn, `/api/resource/Expense%20Claim/${encodeURIComponent(n.name)}`)).data || {};
    const rows = new Map((doc.expenses || []).map((r) => [r.name, r]));
    n.custom_running = 1;
    for (const r of n.expenses || []) {
      r.custom_bill_status = rows.get(r.name)?.custom_bill_status || null;
      r.custom_review_note = rows.get(r.name)?.custom_review_note || null;
    }
  }));
}

/* Claims waiting on the signed-in person: as reporting officer
   ("Waiting for Approval", expense_approver = them) or as verifier ("In
   Review"). The ERP shares each claim with whoever must act on it, so the
   token's own read rights decide what comes back. */
export async function fetchQueue(conn, { state, approver, first = 500 }) {
  const f = [eq("workflow_state", state), eq("docstatus", "0")]; // filter values are strings
  if (approver) f.push(eq("expense_approver", approver));
  /* 12 Nov 2026: the list's NAMES come from REST, whose filters are exact --
     the officer's "To approve" once showed claims already Approved, and the
     claim waiting for them was missing. GraphQL still gives each claim's full
     shape; a claim it did not return is read on its own, and anything it
     returned that REST does not list (another state) is dropped. */
  let names = null;
  try {
    const rf = [["workflow_state", "=", state], ["docstatus", "=", 0]];
    if (approver) rf.push(["expense_approver", "=", approver]);
    const q = new URLSearchParams({ filters: JSON.stringify(rf), fields: JSON.stringify(["name"]), order_by: "modified desc", limit_page_length: String(first) });
    names = ((await rest(conn, `/api/resource/Expense%20Claim?${q}`)).data || []).map((r) => r.name);
  } catch {
    names = null; // REST unreadable: GraphQL alone, filtered by state below
  }
  if (names && !names.length) return [];
  const d = await queryClaims(conn, f, first).catch(() => null);
  const got = new Map((d?.ExpenseClaims?.edges || []).map((e) => [e.node.name, shapeClaim(e.node)]));
  if (!names) return [...got.values()].filter((c) => c.status === state);
  const missing = names.filter((n) => !got.has(n));
  if (missing.length) {
    const read = await Promise.all(missing.map((n) => fetchClaim(conn, n).catch(() => null)));
    read.forEach((c) => c && got.set(c.id, c));
  }
  return names.map((n) => got.get(n)).filter(Boolean);
}

/* Claim types from the ERP, each with its sub types (one per line on the
   type) and whether users may add new ones (Advance). Disabled types are
   kept for old claims but never offered. -> [{ name, subs, open }] */
export function fetchClaimTypes(conn) {
  return cached(conn, "ec-types", async () => {
    let d;
    try {
      d = await gql(conn, TYPES_QUERY);
    } catch {
      d = await gql(conn, TYPES_QUERY_BASE);
    }
    return (d.ExpenseClaimTypes?.edges || [])
      .map((e) => e.node)
      .filter((n) => n.name && !n.custom_disabled)
      .map((n) => ({
        name: n.name,
        subs: String(n.custom_sub_types || "").split("\n").map((s) => s.trim()).filter(Boolean),
        open: !!n.custom_allow_new_sub_types,
      }));
  });
}

/* If the types cannot be read: the ERP's list as of 21 Oct 2026. */
export const DEFAULT_TYPES = [
  { name: "Travel", subs: ["Fuel", "Toll", "Ticket", "Cab"], open: false },
  { name: "Food", subs: [], open: false },
  { name: "Miscellaneous", subs: ["Rent", "Activity", "Meeting"], open: false },
  { name: "Advance", subs: [], open: true },
];

export const typeNames = (types) => (types || []).map((t) => (typeof t === "string" ? t : t.name));

export async function fetchClaimFiles(conn, claimId) {
  const d = await gql(conn, FILES_QUERY, { f: [eq("attached_to_doctype", "Expense Claim"), eq("attached_to_name", claimId)] });
  return (d.Files?.edges || []).map(({ node }) => ({
    id: node.name,
    name: node.file_name || String(node.file_url || "").split("/").pop(),
    url: node.file_url,
    size: num(node.file_size),
    isPrivate: !!node.is_private,
    kind: fileKind(node.file_name || node.file_url),
  }));
}

export function fileKind(name) {
  const ext = String(name || "").split("?")[0].split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function invalidateClaims(conn, employee) {
  evictCached(conn, `ec-claims|${employee}`);
  evictCached(conn, `ec-adv|${employee}`);
}

/* Creates a Draft claim, or rewrites a Draft's rows. Rows keep their ERP
   names so editing one does not churn the child table. */
export async function saveClaim(conn, { claim, employee, postingDate, remark, lines, advanceOf, running }) {
  const doc = {
    doctype: "Expense Claim",
    employee,
    posting_date: postingDate,
    remark: remark || "",
    // The running Miscellaneous claim: no reporting officer, each bill is
    // checked on its own ("Expense Running Guard").
    ...(running ? { custom_running: 1 } : {}),
    expenses: lines.map((l) => ({
      doctype: "Expense Claim Detail",
      ...(l.id ? { name: l.id } : {}),
      expense_date: l.date,
      expense_type: l.type,
      custom_sub_type: l.sub || "",
      custom_bill: l.bill || "",
      description: l.note || "",
      amount: num(l.amount),
      // a planner field line's trip (fieldTrips.tripTag); an ERP without the
      // field ignores it
      ...(l.trip !== undefined ? { custom_trip: l.trip || "" } : {}),
    })),
  };
  if (advanceOf !== undefined) doc.custom_advance = advanceOf || "";
  if (claim) Object.assign(doc, { name: claim.id, modified: claim.modified });
  let d;
  try {
    d = await gql(conn, SAVE_MUTATION, { doc: JSON.stringify(doc) });
  } catch (e) {
    /* A claim type with no default account in the ERP refuses the whole
       claim -- an ERP setup gap (Expense Claim Type → Accounts), not
       something the person filing can fix. Say so in their words. */
    const t = /default account for the\s+(?:<[^>]*>)?\s*Expense Claim Type\s*(?:<[^>]*>)?\s*(?:<a[^>]*>)?\s*([^<.\n]+)/i.exec(e.message);
    if (t) throw new Error(`The ERP is not set up for ${t[1].trim()} claims yet (no account on that claim type). Ask IT / MIS to set it, or file this row under a type that works.`);
    throw e;
  }
  const name = d.saveDoc?.doc?.name;
  if (!name) throw new Error("The ERP did not return the claim number.");
  return name;
}

/* ---------------------------- Employee Advance -------------------------- */

/* Every payment to an employee is an Employee Advance (paid by Accounts with
   a Payment Entry). What is left of each -- paid less claimed less returned
   -- is cash in hand; the running claim uses the oldest first when the next
   payment closes it. REST: the advance list is small and GraphQL may not
   carry the doctype. -> newest first */
export function fetchAdvances(conn, employee) {
  return cached(conn, `ec-adv|${employee}`, async () => {
    const q = new URLSearchParams({
      // 16 Nov 2026: a LOAN is not cash to spend -- an advance booked to a
      // loan account ("Employee Loans - ELPL", repaid from salary) is left out
      filters: JSON.stringify([["employee", "=", employee], ["docstatus", "<", 2], ["advance_account", "not like", "%Loan%"]]),
      fields: JSON.stringify(["name", "posting_date", "purpose", "advance_amount", "paid_amount", "claimed_amount", "return_amount", "status", "docstatus", "modified"]),
      order_by: "posting_date desc, creation desc",
      limit_page_length: "500",
    });
    const d = await rest(conn, `/api/resource/Employee%20Advance?${q}`);
    return (d.data || []).map((a) => {
      const paid = num(a.paid_amount);
      return {
        id: a.name,
        date: String(a.posting_date || "").slice(0, 10),
        purpose: String(a.purpose || "").trim(),
        amount: num(a.advance_amount),
        paid,
        claimed: num(a.claimed_amount),
        returned: num(a.return_amount),
        left: Math.max(0, paid - num(a.claimed_amount) - num(a.return_amount)),
        // Asked for and not paid yet (draft, or approved and waiting for the payment).
        waiting: num(a.docstatus) === 0 || paid <= 0,
        status: a.status || "",
        docstatus: num(a.docstatus),
      };
    });
  });
}

/* "Request cash": a draft Employee Advance -- the ERP fills the company and
   advance account, and a Task goes to Accounts ("Employee Advance Task"),
   who approve it and pay it. */
export async function requestAdvance(conn, { employee, amount, purpose, date }) {
  const body = JSON.stringify({ employee, posting_date: date, purpose, advance_amount: num(amount), currency: "INR", exchange_rate: 1 });
  const d = await rest(conn, "/api/resource/Employee%20Advance", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!d.data?.name) throw new Error("The ERP did not return the request number.");
  return d.data.name;
}

/* The employee's open running claim, read fresh (null = none yet): a bill is
   always added onto the latest version -- a background check may have saved
   it a moment ago. */
export async function fetchOpenClaim(conn, employee) {
  // Every open running claim (a few at most), then the settlement one: a Food
  // claim from the 3-11 Nov 2026 trial may still be open, and the ERP takes
  // only Food bills on it. (A child-table filter here 500s over REST.)
  const q = new URLSearchParams({
    filters: JSON.stringify([["employee", "=", employee], ["custom_running", "=", 1], ["docstatus", "=", 0]]),
    fields: JSON.stringify(["name"]),
    limit_page_length: "50",
  });
  for (const r of (await rest(conn, `/api/resource/Expense%20Claim?${q}`)).data || []) {
    const c = await fetchClaim(conn, r.name);
    if (!c.lines.some((l) => l.type === "Food")) return c;
  }
  return null;
}

/* The employee's field TA/DA claim for a month (the planner's, found by its
   remark "Field TA/DA · 2026-10"), read fresh -- the latest that is not
   cancelled. null = none yet. */
export async function fetchClaimByRemark(conn, employee, remark) {
  const q = new URLSearchParams({
    filters: JSON.stringify([["employee", "=", employee], ["remark", "=", remark], ["docstatus", "<", 2]]),
    fields: JSON.stringify(["name"]),
    order_by: "creation desc",
    limit_page_length: "1",
  });
  const name = ((await rest(conn, `/api/resource/Expense%20Claim?${q}`)).data || [])[0]?.name;
  return name ? fetchClaim(conn, name) : null;
}

/* Every claim with this remark, newest first (13 Nov 2026): a month can hold
   more than one -- once a month's claim is approved, trips added later go into
   a new one. -> [claim]
   ALL of them (26 Nov 2026): it read only the newest 10, so a rep with more
   claims saw the trips in the older ones as "to claim" again and sent them
   again -- the same days approved several times over. */
export async function fetchClaimsByRemark(conn, employee, remark, max = 500) {
  const q = new URLSearchParams({
    filters: JSON.stringify([["employee", "=", employee], ["remark", "=", remark], ["docstatus", "<", 2]]),
    fields: JSON.stringify(["name"]),
    order_by: "creation desc",
    limit_page_length: String(max),
  });
  const names = ((await rest(conn, `/api/resource/Expense%20Claim?${q}`)).data || []).map((r) => r.name);
  return Promise.all(names.map((n) => fetchClaim(conn, n)));
}

/* A draft claim left with nothing on it. */
export async function deleteClaim(conn, name) {
  await rest(conn, `/api/resource/Expense%20Claim/${encodeURIComponent(name)}`, { method: "DELETE" });
}

/* Runs a save again on a fresh read when someone else saved first ("modified
   after you opened it") -- e.g. a background bill check landing meanwhile. */
export async function retryOnConflict(save, also = null, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await save();
    } catch (e) {
      if (i + 1 >= tries || !(/modified after|TimestampMismatch/i.test(e.message) || (also && also.test(e.message)))) throw e;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500 * (i + 1)));
    }
  }
}

/* One claim, fresh (e.g. to get its new `modified` and row names after a save). */
export async function fetchClaim(conn, name) {
  const d = await queryClaims(conn, [eq("name", name)], 1);
  const node = d.ExpenseClaims?.edges?.[0]?.node;
  if (!node) throw new Error(`Claim ${name} could not be read back.`);
  return shapeClaim(node);
}

/* ---------------------------- REST helpers ------------------------------ */

async function rest(conn, path, init = {}) {
  const res = await fetch(conn.origin + path, {
    ...init,
    headers: { Accept: "application/json", Authorization: conn.authToken, ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = json.exception || json.exc_type || `HTTP ${res.status}`;
    try {
      msg = JSON.parse(JSON.parse(json._server_messages)[0]).message || msg;
    } catch {
      /* keep msg */
    }
    const err = new Error(String(msg).replace(/<[^>]*>/g, "").replace(/^[\w.]+Error:\s*/, ""));
    err.status = res.status; // 403 = not for this login (e.g. CEO batches for anyone but the CEO)
    throw err;
  }
  return json;
}

/* A workflow action on a claim, as the signed-in user: "Send for Approval",
   "Withdraw", "Approve", "Reject", "Verify". The ERP checks the transition
   (who may approve is the claim's expense_approver; who may verify is the
   verifier) and runs the approval scripts. */
export async function applyAction(conn, name, action) {
  const doc = (await rest(conn, `/api/resource/Expense%20Claim/${encodeURIComponent(name)}`)).data;
  const body = new URLSearchParams({ doc: JSON.stringify(doc), action });
  try {
    return (await rest(conn, "/api/method/frappe.model.workflow.apply_workflow", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })).message;
  } catch (e) {
    if (/not a valid workflow action|Not Allowed|not allowed/i.test(e.message)) {
      throw new Error(`"${action}" is not possible on ${name} right now -- it may already have moved on. Refresh and try again.`);
    }
    throw e;
  }
}

/* A note on the claim's timeline (rejection reasons). */
export async function addClaimComment(conn, name, text) {
  const email = (await loggedUser(conn)) || "";
  const body = new URLSearchParams({ reference_doctype: "Expense Claim", reference_name: name, content: text, comment_email: email, comment_by: email });
  return rest(conn, "/api/method/frappe.desk.form.utils.add_comment", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

/* The latest comments on a claim (why it was rejected), newest first. */
export async function fetchClaimComments(conn, name) {
  const q = new URLSearchParams({
    filters: JSON.stringify([["reference_doctype", "=", "Expense Claim"], ["reference_name", "=", name], ["comment_type", "=", "Comment"]]),
    fields: JSON.stringify(["content", "comment_by", "owner", "creation"]),
    order_by: "creation desc",
    limit_page_length: "5",
  });
  try {
    const d = await rest(conn, `/api/resource/Comment?${q}`);
    return (d.data || []).map((c) => ({ text: String(c.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), by: c.comment_by || c.owner, at: c.creation }));
  } catch {
    return [];
  }
}

/* The verifier may lower a row's sanctioned amount before verifying; the
   payroll entry is made from the sanctioned figures. */
export async function saveSanctioned(conn, claim, sanctionedById) {
  const doc = {
    doctype: "Expense Claim",
    name: claim.id,
    modified: claim.modified,
    // The whole row every time: a save replaces the child table with what it
    // is given. (AI fields are put back by the ERP's AI Guard.)
    expenses: claim.lines.map((l) => ({
      doctype: "Expense Claim Detail",
      name: l.id,
      expense_date: l.date,
      expense_type: l.type,
      custom_sub_type: l.sub || "",
      custom_bill: l.bill || "",
      description: l.note || "",
      amount: l.amount,
      sanctioned_amount: num(sanctionedById[l.id] ?? l.amount),
    })),
  };
  await gql(conn, SAVE_MUTATION, { doc: JSON.stringify(doc) });
}

/* ------------------------------ AI check -------------------------------- */

/* Reads a bill the moment it is attached -- the only time any AI runs on it:
   our server (/api/claims/read-bill) sends it to Cloudflare Gemma 4 (a photo,
   a PDF's text copied out here, or a scanned PDF's page pictures), then
   Clairic (values) and Clef Flash (title) on its answer. The form fills
   title, amount and date from it; the person may change them. The read comes
   back signed by the server and goes along to checkClaim, which compares it
   with what was submitted in plain code.
   -> { amount, date, vendor, what, kind, readable, signed } (null = not read;
      signed = { read, sig } for checkClaim; skipped = the reader is off) */
const readerKindOf = (md) => {
  try {
    const k = JSON.parse(md || "{}")?.kind;
    if (k) return String(k);
  } catch {
    /* not JSON: look for the field in the text */
  }
  return (/"kind"\s*:\s*"([^"]+)"/.exec(String(md || "")) || [])[1] || "";
};
export async function extractBill(conn, file) {
  const form = new FormData();
  form.append("files", file, file.name || "bill");
  // a PDF also goes as its text, or -- a scanned PDF -- as pictures of its pages
  const pdf = await pdfForReading(file);
  if (pdf.text) form.append("text", pdf.text);
  for (const p of pdf.pages || []) form.append("page", p, p.name);
  const res = await fetch("/api/claims/read-bill", {
    method: "POST",
    headers: { "x-erp-token": conn.authToken, "x-erp-endpoint": conn.endpointUrl },
    body: form,
    signal: AbortSignal.timeout(150000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `The bill could not be read (HTTP ${res.status}).`);
  if (json.skipped) return { skipped: true, readable: true };
  if (!json.read) return { readable: false };
  const r = json.read, v = r.values || {};
  return {
    amount: typeof v.total === "number" && v.total > 0 ? v.total : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(v.date || "")) ? v.date : null,
    vendor: v.vendor || null,
    what: r.title && r.title !== "Not a bill" && r.title !== "Other bill" ? r.title : null,
    kind: r.title === "Not a bill" ? "not_a_bill" : "printed",
    // the reader's own kind of bill ("hotel", "cab", ...; settlement_api
    // read_kind reads the same) and its title ("Hotel bill"): an own bill that
    // is really TA/DA is caught on the form (23 Nov 2026)
    readerKind: readerKindOf(r.md),
    readTitle: r.title || "",
    // Clef's pick among the reader's TITLES ("Courier", "Stationery", "Mobile
    // recharge", ...): Gemma only knows the TA/DA kinds + "other", so an own
    // bill's kind is picked off this (24 Nov 2026) -- never used to refuse one
    clefTitle: r.clefTitle || "",
    // Gemma's call (16 Nov 2026): a handwritten bill needs a reason and the
    // payment proof (or "paid in cash") before it can be sent
    handwritten: !!r.handwritten,
    // already claimed -- on a settlement bill or a planner trip, by anyone
    // (an ERP script older than 26 Nov 2026 still refuses it)
    duplicate: json.duplicate || null,
    // 26 Nov 2026: a repeat is flagged, not refused -- who claimed it, when
    dupOf: json.dup || null,
    readable: true,
    signed: { read: r, sig: json.sig },
  };
}

/* Has the app server compare each bill on the claim with its signed read
   (plain code) and save the result. -> { score, risk, summary, rows } | { skipped, reason }
   rows: only these bills (the one just added); none = every bill still due.
   reads: { <row name>: signed } from extractBill. */
export async function checkClaim(conn, name, rows, reads) {
  const res = await fetch("/api/claims/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-erp-token": conn.authToken },
    body: JSON.stringify({ endpoint: conn.endpointUrl, claim: name, ...(rows ? { rows } : {}), ...(reads ? { reads } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `The bill check failed (HTTP ${res.status}).`);
  return json;
}

export const ATTACH_ACCEPT ="image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const ATTACH_MAX = 10 * 1024 * 1024;

export function checkFile(file) {
  if (!ATTACH_ACCEPT.split(",").includes(file.type)) return `${file.name}: only photos and PDFs can be attached.`;
  if (file.size > ATTACH_MAX) return `${file.name} is over 10 MB.`;
  return null;
}

export async function uploadClaimFile(conn, claimId, file) {
  const form = new FormData();
  form.append("operations", JSON.stringify({
    query: UPLOAD_MUTATION,
    variables: { file: null, attached_to_doctype: "Expense Claim", attached_to_name: claimId, is_private: true },
  }));
  form.append("map", JSON.stringify({ 0: ["variables.file"] }));
  form.append("0", file);
  // No Content-Type: the browser sets the multipart boundary.
  const res = await fetch(conn.endpointUrl, { method: "POST", headers: { Authorization: conn.authToken }, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || `${file.name} could not be uploaded (HTTP ${res.status}).`);
  }
  if (!json.data?.uploadFile?.file_url) throw new Error(`${file.name} was not stored by the ERP.`);
  return json.data.uploadFile;
}

/* ---------------------- Field claim: the final check ---------------------- */

/* The rep's own planner claim for a month as the final check left it (ERP
   "Field Expense Claims API", action mine): each line's adjustment -- new
   amount, why, who, when -- and who finalised it. null when the API is not
   there yet (the planner then simply shows no adjustments). */
export async function fetchMyFieldClaim(conn, month) {
  let m;
  try {
    m = (await rest(conn, `/api/method/field_expense_claims?${new URLSearchParams({ action: "mine", month })}`)).message || {};
  } catch {
    return null;
  }
  const c = (m.claims || [])[0];
  if (!c) return null;
  const names = m.names || {};
  const lines = (m.lines || []).filter((l) => l.parent === c.name);
  const adjustments = lines
    .filter((l) => Number(l.custom_adjusted))
    .map((l) => ({
      date: String(l.expense_date || "").slice(0, 10),
      type: l.expense_type,
      note: String(l.description || ""),
      amount: num(l.amount),
      final: num(l.custom_adjusted_amount),
      reason: l.custom_adjust_reason || "",
      by: names[l.custom_adjusted_by] || l.custom_adjusted_by || "",
      on: l.custom_adjusted_on || null,
      // the reporting officer's own change (he writes the same fields), not the final check's
      byOfficer: !!l.custom_officer_by && l.custom_adjusted_by === l.custom_officer_by,
    }));
  return {
    name: c.name,
    state: c.workflow_state,
    final: lines.reduce((s, l) => s + (Number(l.custom_adjusted) ? num(l.custom_adjusted_amount) : num(l.amount)), 0),
    adjustments,
    finalisedBy: names[c.custom_finalised_by] || c.custom_finalised_by || null,
    finalisedOn: c.custom_finalised_on || null,
    additionalSalary: c.custom_additional_salary || null,
  };
}

/* ------------------- Field claim: trip by trip (12 Nov 2026) ------------------- */

/* A field claim with each line's trip and the officer's decision on it, and
   the claim's department. REST, not GraphQL: the GraphQL schema lags new ERP
   fields until a cache clear. The claim comes back unchanged if it can't be
   read. */
export async function withTripMarks(conn, claim) {
  if (!claim) return claim;
  let doc;
  try {
    doc = (await rest(conn, `/api/resource/Expense%20Claim/${encodeURIComponent(claim.id)}`)).data || {};
  } catch {
    return claim;
  }
  const rows = new Map((doc.expenses || []).map((r) => [r.name, r]));
  // a hotel bill's whole stay, as read at upload (custom_bill_meta), so a sent
  // bill can still be spread over the other cards its nights fall in (23 Nov 2026)
  const stayOf = (r) => {
    try {
      const m = JSON.parse(r.custom_bill_meta || "{}").bill || {};
      return m.check_in && m.check_out ? { checkIn: m.check_in, checkOut: m.check_out, total: num(m.total) || num(r.custom_bill_amount) } : null;
    } catch {
      return null;
    }
  };
  return {
    ...claim,
    department: String(doc.department || "").replace(/ - ELPL$/, ""),
    lines: claim.lines.map((l) => {
      const r = rows.get(l.id) || {};
      return {
        ...l,
        trip: r.custom_trip || "",
        ...(r.expense_type === "Stay" && stayOf(r) ? { stay: stayOf(r) } : {}),
        decision: r.custom_trip_decision || "",
        decisionNote: r.custom_trip_note || "",
        decidedBy: r.custom_trip_decided_by || "",
        decidedOn: r.custom_trip_decided_on || "",
        // a TA amount the officer (or the final check) changed, and why
        ...(Number(r.custom_adjusted)
          ? { adjusted: true, final: num(r.custom_adjusted_amount), adjustReason: r.custom_adjust_reason || "", adjustedBy: r.custom_adjusted_by || "" }
          : { adjusted: false, final: l.amount }),
        // the reporting officer's own record of a TA change (kept even if the
        // final check changes the line again) -- 13 Nov 2026
        ...(r.custom_officer_by ? { officerBy: r.custom_officer_by, officerAmount: num(r.custom_officer_amount), officerReason: r.custom_officer_reason || "" } : {}),
      };
    }),
  };
}

/* Each claim's department (the team), by name. -> { [claim]: "Cardiac" } */
export async function fetchClaimDepartments(conn, names) {
  if (!names.length) return {};
  const q = new URLSearchParams({
    filters: JSON.stringify([["name", "in", names]]),
    fields: JSON.stringify(["name", "department"]),
    limit_page_length: String(names.length),
  });
  try {
    const d = await rest(conn, `/api/resource/Expense%20Claim?${q}`);
    return Object.fromEntries((d.data || []).map((r) => [r.name, String(r.department || "").replace(/ - ELPL$/, "")]));
  } catch {
    return {};
  }
}

/* The officer's decision on one trip of a waiting field claim ("Field Trip
   Decision API"): "Approved" | "Rejected" (note needed) | "" (undo).
   -> { approved, rejected, pending, rows } -- line counts over the claim */
export async function decideTrip(conn, { claim, rows, decision, note, trip }) {
  const body = new URLSearchParams({ claim, rows: JSON.stringify(rows), decision: decision || "", note: note || "", trip: trip || "" });
  try {
    return (await rest(conn, "/api/method/field_trip_decide", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).message || {};
  } catch (e) {
    if (/field_trip_decide|not found|No module|Failed to get method/i.test(e.message)) throw new Error("Trip-by-trip approval is not set up on this ERP yet (Field Trip Decision API).");
    throw e;
  }
}

/* The officer's own tools on a planner field claim (13 Nov 2026), through the
   ERP's "Field Trip Officer API" (method field_trip_officer): change a TA line's
   amount with a reason while it waits with them, and read each day's visits. */
async function officerCall(conn, method, params) {
  try {
    if (method === "GET") return (await rest(conn, `/api/method/field_trip_officer?${new URLSearchParams(params)}`)).message || {};
    return (await rest(conn, "/api/method/field_trip_officer", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) })).message || {};
  } catch (e) {
    if (/field_trip_officer|not found|No module|Failed to get method/i.test(e.message)) throw new Error("Changing TA is not set up on this ERP yet (Field Trip Officer API).");
    throw e;
  }
}
/* lines: [{ row, amount }] -> { changed } */
export function adjustTripTA(conn, { claim, lines, reason }) {
  return officerCall(conn, "POST", { action: "adjust", claim, lines: JSON.stringify(lines), reason: reason || "" });
}
/* -> { [date]: { visits, places: { town: n } } } ({} when not set up) */
export async function fetchClaimVisits(conn, claim) {
  try {
    return (await officerCall(conn, "GET", { action: "visits", claim })).days || {};
  } catch {
    return {};
  }
}

/* ----------------------------- Car requests ----------------------------- */

/* A rep's request to go by own car on a trip (12 Nov 2026). Everything goes
   through the ERP's "Car Request API" script (method car_request): reps have
   no DocType permission, the GM (or a System Manager) decides. */
const CAR_STATUS = { Pending: "pending", Approved: "approved", Rejected: "rejected", Withdrawn: "withdrawn" };
export function shapeCarRequest(r) {
  const status = CAR_STATUS[r.status] || "pending";
  return {
    id: r.name,
    employee: r.employee,
    employeeName: r.employee_name || r.employee,
    status,
    tripId: r.trip || null,
    planId: r.trip || null,
    from: String(r.from_date || "").slice(0, 10),
    to: String(r.to_date || "").slice(0, 10),
    places: r.places || "",
    km: num(r.km),
    fuel: r.fuel || "Petrol",
    fuelCost: num(r.fuel_cost),
    tolls: num(r.tolls),
    suggested: num(r.suggested),
    asked: num(r.ask),
    // what the trip may claim: the GM's amount once approved, else what was asked
    ask: status === "approved" ? num(r.approved_amount) : num(r.ask),
    approvedAmount: num(r.approved_amount),
    approver: r.approver || null,
    decidedBy: r.decided_by || null,
    decidedOn: r.decided_on || null,
    note: r.note || "",
    requestedAt: r.creation || null,
  };
}
const carCall = (conn, method, params) =>
  method === "GET"
    ? rest(conn, `/api/method/car_request?${new URLSearchParams(params)}`)
    : rest(conn, "/api/method/car_request", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });

/* -> { requests, decider } */
export async function fetchMyCarRequests(conn) {
  const m = (await carCall(conn, "GET", { action: "mine" })).message || {};
  return { requests: (m.requests || []).map(shapeCarRequest), decider: !!m.decider };
}
export async function createCarRequest(conn, req) {
  const m = (
    await carCall(conn, "POST", {
      action: "create",
      trip: req.tripId || req.planId || "",
      from_date: req.from,
      to_date: req.to,
      places: req.places || "",
      km: String(req.km || 0),
      fuel: req.fuel || "Petrol",
      fuel_cost: String(req.fuelCost || 0),
      tolls: String(req.tolls || 0),
      suggested: String(req.suggested || 0),
      ask: String(req.ask || 0),
    })
  ).message || {};
  return m.request ? shapeCarRequest(m.request) : null;
}
export function withdrawCarRequest(conn, id) {
  return carCall(conn, "POST", { action: "withdraw", name: id });
}
/* The GM's list. -> { pending, recent } (a non-decider gets a 403) */
export async function fetchCarQueue(conn) {
  const m = (await carCall(conn, "GET", { action: "queue" })).message || {};
  return { pending: (m.pending || []).map(shapeCarRequest), recent: (m.recent || []).map(shapeCarRequest) };
}
/* decision: "Approve" (amount may differ from the ask) | "Reject" (note needed) */
export async function decideCarRequest(conn, id, decision, amount, note) {
  const m = (await carCall(conn, "POST", { action: "decide", name: id, decision, amount: String(amount || ""), note: note || "" })).message || {};
  return m.request ? shapeCarRequest(m.request) : null;
}

/* ------------------------ non-reported days ---------------------------- */

/* Non-reported days (21 Nov 2026): a rep's day with nothing paid on record --
   what they did (doctor visits, a meeting, other work, the HQ for an HQ-less
   meeting) waits on their manager (the direct parent seat; a vacant seat passes
   it up; the next person up after 2 days). Approve makes the events in the rep's
   name and recalculates the day; Reject needs a note. ERP Server Script "Field
   Non-Reported Day API" (method field_nonreport_day), as the signed-in user:
   share/src/app/field-expense/server/field_nonreport_day_api.py. */
const nrCall = (conn, method, params) =>
  method === "GET"
    ? rest(conn, `/api/method/field_nonreport_day?${new URLSearchParams(params)}`)
    : rest(conn, "/api/method/field_nonreport_day", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
export function shapeNonReport(t) {
  return {
    id: t.name,
    date: t.date,
    status: t.status === "Completed" ? "approved" : t.status === "Cancelled" ? "rejected" : "waiting",
    employee: t.employee,
    employeeName: t.employee_name || t.employee,
    entries: t.entries || [],
    can: t.can || null,
    approverNames: t.approver_names || "",
    escalationNames: t.escalation_names || "",
    decidedBy: t.decided_by_name || "",
    note: t.note || "",
    events: t.events || [],
    raised: t.creation,
  };
}
/* -> { pending, recent } */
export async function fetchNonReportQueue(conn) {
  const m = (await nrCall(conn, "GET", { action: "queue" })).message || {};
  // the ERP lists only the days waiting on this user (no passed-up ones, 25 Nov 2026)
  return { pending: (m.pending || []).map(shapeNonReport), recent: (m.recent || []).map(shapeNonReport) };
}
/* decision: "Approve" | "Reject" (note needed) -> { request, events, recalc } */
export async function decideNonReport(conn, id, decision, note) {
  const m = (await nrCall(conn, "POST", { action: "decide", name: id, decision, note: note || "" })).message || {};
  return { request: m.task ? shapeNonReport(m.task) : null, events: m.events || [], recalc: m.recalc || null };
}

/* ------------------------- settlement approval -------------------------- */

/* Settlement approval (16 Nov 2026): a request -- the AI-checked bills on the
   rep's open settlement claim, or a cash advance -- goes up the requester's
   reporting line (BE > ABM > RBM > SM/ZSM > GM > CEO); the CEO's approval is
   final (bills Verified, or the advance to Accounts to pay). ERP Server Script
   "Settlement API" (method settlement), as the signed-in user:
   share/src/app/expense-claims/server/settlement_api.py. */
const num0 = (v) => Number(v) || 0;
export function shapeSettlement(r) {
  return {
    id: r.name,
    employee: r.employee,
    employeeName: r.employee_name || r.employee,
    hq: r.hq || "",
    // the seat's department (18 Nov 2026): SM, GM and the CEO group by it
    team: r.team || "",
    // sent again after a rejection (17 Nov 2026): { from, by, note }
    resent: r.resent && r.resent.from ? { from: r.resent.from, by: r.resent.by || "", note: r.resent.note || "" } : null,
    // booked in the accounts at the CEO's approval (17 Nov 2026): the claim (a
    // bill) or the advance (cash), and whether Accounts has paid it
    booked: r.booked ? {
      // a bill: its Journal Entry (23 Nov 2026; was an Expense Claim)
      claim: r.booked.claim || "", entry: r.booked.entry || "", advance: r.booked.advance || "",
      paid: /^paid$/i.test(r.booked.status || "") || (r.booked.advance && num0(r.booked.paid) > 0),
      amountPaid: num0(r.booked.paid),
    } : null,
    user: r.user,
    kind: r.kind === "Cash" ? "cash" : "bills",
    status: String(r.status || "").toLowerCase(), // waiting | approved | rejected | withdrawn
    amount: num0(r.amount),
    purpose: r.purpose || "",
    claim: r.claim || "",
    advance: r.advance || "",
    step: num0(r.step),
    nextApprover: r.next_approver || "",
    nextLabel: r.next_label || "",
    note: r.note || "",
    decidedBy: r.decided_by || "",
    decidedOn: r.decided_on && r.decided_on !== "None" ? r.decided_on : "",
    created: r.creation,
    modified: r.modified,
    steps: (r.steps || []).map((s) => ({
      user: s.user,
      name: s.name || s.user,
      level: s.level || "",
      decision: s.decision || "",
      at: s.at && s.at !== "None" ? s.at : "",
      note: s.note || "",
    })),
    // the settlement type (23 Nov 2026): "Own" | "Doctor activity" |
    // "Doctor service" | "Cash"; the own bill's kind, the doctor, and the
    // Doctor Service a bill over the activity limit is tagged to
    type: r.type || (r.kind === "Cash" ? "Cash" : "Own"),
    expenseKind: r.expense_kind || "",
    doctor: r.doctor || "",
    doctorName: r.doctor_name || r.doctor || "",
    // a doctor service bill with no service (the settings switch off): the day it was done
    serviceDate: String(r.service_date || "").slice(0, 10),
    service: r.service && r.service.name ? {
      name: r.service.name, service: r.service.service || r.service.name, date: String(r.service.date || "").slice(0, 10),
      amount: num0(r.service.amount), billed: num0(r.service.billed), left: num0(r.service.left),
      state: r.service.state || "", approved: !!r.service.approved, refused: !!r.service.refused,
    } : null,
    bills: (r.bills || []).map((b) => ({
      row: b.row,
      date: String(b.date || "").slice(0, 10),
      title: b.title || "",
      amount: num0(b.amount),
      bill: b.bill || "",
      score: b.score == null || b.score === "" ? null : num0(b.score),
      risk: b.risk || "",
      reason: b.reason || "",
      // a repeat of an earlier bill (26 Nov 2026: flagged, not refused) --
      // the approvers compare the two photos side by side
      dup: b.dup ? {
        sure: !!b.dup.sure, why: b.dup.why || "", employeeName: b.dup.employee_name || "", samePerson: !!b.dup.same_person,
        where: b.dup.where || "", billDate: String(b.dup.bill_date || "").slice(0, 10), amount: num0(b.dup.amount),
        vendor: b.dup.vendor || "", billNo: b.dup.bill_no || "", claimedOn: String(b.dup.claimed_on || "").slice(0, 10), photo: b.dup.photo || "",
      } : null,
    })),
  };
}
const settleCall = (conn, method, params) =>
  method === "GET"
    ? rest(conn, `/api/method/settlement?${new URLSearchParams(params)}`)
    : rest(conn, "/api/method/settlement", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });

/* The requester's own requests and the chain a new one would go up.
   -> { requests, chain: [{ user, name, level }], overview } */
export async function fetchMySettlements(conn) {
  const m = (await settleCall(conn, "GET", { action: "mine" })).message || {};
  const requests = (m.requests || []).map(shapeSettlement);
  // fresh for the home strip too (fetchCashAdvanceIds)
  const ids = cashAdvancesOf(requests);
  evictCached(conn, "ec-cash-adv");
  cached(conn, "ec-cash-adv", () => Promise.resolve(ids));
  return { requests, chain: m.chain || [], overview: !!m.overview };
}
/* The cash advances that came from the rep's own Cash requests -- the only
   ones the server books bills against (settlement_api settlement_advances),
   so the only ones that count as cash in hand (model.ledger). */
export const cashAdvancesOf = (requests) => [...new Set((requests || []).filter((r) => r.kind === "cash" && r.advance).map((r) => r.advance))];
/* The same list on its own, cached (the home strip). -> [advance ids] */
export function fetchCashAdvanceIds(conn) {
  return cached(conn, "ec-cash-adv", async () => cashAdvancesOf((await fetchMySettlements(conn)).requests));
}
/* Every checked, unsent bill on the open settlement claim, as one request. */
/* One request PER BILL (16 Nov 2026): -> { count, amount, requests } */
/* refused: the bills the server would not send, each in words (an own bill
   whose photo is a hotel / food / fuel / travel bill, a doctor service with no
   room left); none sent at all -> it throws with those words */
export async function sendBillsForApproval(conn, rows) {
  const m = (await settleCall(conn, "POST", { action: "send_bills", ...(rows?.length ? { rows: rows.join(",") } : {}) })).message || {};
  const requests = (m.requests || (m.request ? [m.request] : [])).map(shapeSettlement);
  return { count: m.count ?? requests.length, amount: num0(m.amount ?? requests.reduce((s, r) => s + r.amount, 0)), requests, refused: (m.refused || []).map(String) };
}
/* "Request cash": an advance, up the same chain. */
export async function requestCashThroughChain(conn, { amount, purpose }) {
  const m = (await settleCall(conn, "POST", { action: "send_cash", amount: String(amount), purpose })).message || {};
  return m.request ? shapeSettlement(m.request) : null;
}
/* Take a request back -- only before anyone has approved it. */
export async function withdrawSettlement(conn, id) {
  const m = (await settleCall(conn, "POST", { action: "withdraw", name: id })).message || {};
  return m.request ? shapeSettlement(m.request) : null;
}
/* The approver's lists. -> { waiting, team, decided, overview, me } */
export async function fetchSettlementQueue(conn) {
  const m = (await settleCall(conn, "GET", { action: "queue" })).message || {};
  return {
    waiting: (m.waiting || []).map(shapeSettlement),
    team: (m.team || []).map(shapeSettlement),
    decided: (m.decided || []).map(shapeSettlement),
    overview: !!m.overview,
    me: m.me || "",
  };
}
/* Approve several at once (18 Nov 2026): one server call; the ones that
   reach the CEO go to him as ONE batch. -> { approved, toCeo, batch, skipped } */
export async function approveSettlements(conn, ids) {
  const m = (await settleCall(conn, "POST", { action: "approve_many", names: ids.join(",") })).message || {};
  return { approved: m.approved || 0, toCeo: m.to_ceo || 0, batch: m.batch || "", skipped: m.skipped || [] };
}
/* The CEO's batches (from the GM / SM): waiting, and the last 30 days. */
export async function fetchCeoBatches(conn) {
  const m = (await settleCall(conn, "GET", { action: "ceo_batches" })).message || {};
  return {
    ceo: !!m.ceo,
    batches: (m.batches || []).map((b) => ({
      id: b.name, status: String(b.status || "").toLowerCase(), by: b.made_by_name || b.made_by || "", amount: num0(b.amount), count: b.count || 0,
      created: b.creation, decidedOn: b.decided_on && b.decided_on !== "None" ? b.decided_on : "",
      requests: (b.requests || []).map(shapeSettlement),
    })),
  };
}
/* The CEO approves what still waits in a batch -> { approved, amount } */
export async function approveCeoBatch(conn, id) {
  const m = (await settleCall(conn, "POST", { action: "decide_batch", name: id })).message || {};
  return { approved: m.approved || 0, amount: num0(m.amount) };
}
/* decision: "Approve" | "Reject" (a reason needed -- the requester sees it) */
export async function decideSettlement(conn, id, decision, note) {
  const m = (await settleCall(conn, "POST", { action: "decide", name: id, decision, note: note || "" })).message || {};
  return m.request ? shapeSettlement(m.request) : null;
}

/* ---------------------- Settlement bills (23 Nov 2026) ----------------------
   Each settlement bill is its own Settlement Expense (SE-#####), kept apart
   from Expense Claim (which holds only the field TA/DA), read and written only
   through the Settlement API -- the rep has no permission on the doctype. */

/* The signed-in person's own bills, newest first:
   [{ name, date, title, amount, bill, proof, status, settlement, review,
      entry, from_advance, payable, paid, modified }] */
export async function fetchSettlementBills(conn) {
  return (await readSettlementBills(conn)).bills;
}
/* ... and whose they are: { bills, employee } (employee: the login's own
   Employee, null when none; undefined from a server too old to say) */
async function readSettlementBills(conn) {
  const m = (await settleCall(conn, "GET", { action: "bills" })).message || {};
  return { bills: m.bills || [], employee: m.employee };
}

/* A photo uploaded as the person, private and attached to nothing yet: the
   Settlement API attaches it to the bill it makes. -> { name, file_url } */
export async function uploadPrivateFile(conn, file) {
  const form = new FormData();
  form.append("operations", JSON.stringify({ query: UPLOAD_MUTATION, variables: { file: null, is_private: true } }));
  form.append("map", JSON.stringify({ 0: ["variables.file"] }));
  form.append("0", file);
  const res = await fetch(conn.endpointUrl, { method: "POST", headers: { Authorization: conn.authToken }, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || `${file.name} could not be uploaded (HTTP ${res.status}).`);
  }
  if (!json.data?.uploadFile?.file_url) throw new Error(`${file.name} was not stored by the ERP.`);
  return json.data.uploadFile;
}

/* What the bill forms need from Settlement Settings (23 Nov 2026), cached:
   { ownKinds, taDaKinds: [{ kind, words }], activityLimit, maxAmount,
     maxAgeDays, canRequestCash, level, doctorReady: { activity, service } }.
   Unreadable never blocks the page: the safe answer (own = Other, no cash). */
/* The words of each own kind (settlement_api DEFAULTS "kinds") -- used when
   the server does not send own_kind_words (a Settlement API older than 24 Nov
   2026). The bill sheet picks the kind off the bill with them. */
const OWN_KIND_WORDS = [
  { kind: "Courier & postage", words: ["courier", "postage", "post", "parcel"] },
  { kind: "Printing & stationery", words: ["printing", "print", "xerox", "photocopy", "stationery"] },
  { kind: "Phone & internet", words: ["phone", "mobile", "recharge", "internet", "broadband", "sim"] },
  { kind: "Meeting", words: ["meeting", "hall", "venue", "conference"] },
];
const SETTLE_SETTINGS_FALLBACK = {
  ownKinds: ["Other"], ownKindWords: OWN_KIND_WORDS, taDaKinds: [], activityLimit: 2000, serviceNeedsRecord: true, maxAmount: null, maxAgeDays: 365,
  canRequestCash: false, level: "", doctorReady: { activity: false, service: false }, fallback: true,
};
export function fetchSettlementSettings(conn) {
  return cached(conn, "ec-settle-settings", async () => {
    const m = (await settleCall(conn, "GET", { action: "settings" })).message || {};
    return {
      ownKinds: (m.own_kinds || []).map(String).filter(Boolean),
      ownKindWords: Array.isArray(m.own_kind_words)
        ? m.own_kind_words.map((k) => ({ kind: String(k.kind || ""), words: (k.words || []).map((w) => String(w).toLowerCase()) }))
        : OWN_KIND_WORDS,
      taDaKinds: (m.ta_da_kinds || []).map((k) => ({ kind: String(k.kind || ""), words: (k.words || []).map((w) => String(w).toLowerCase()) })),
      activityLimit: num0(m.activity_limit) || 2000,
      // the settings switch (24 Nov 2026): over the limit, tag to a Doctor
      // Service (true, as before) -- or just give the day the service was done
      serviceNeedsRecord: m.service_needs_record !== false,
      maxAmount: m.max_amount == null ? null : num0(m.max_amount),
      maxAgeDays: num0(m.max_age_days) || 365,
      // the bills' date window (25 Nov 2026, Settlement Settings "Bills from / to"): e.g. October alone
      billsFrom: m.bills_from || null,
      billsTo: m.bills_to || null,
      windowText: m.window_text || null,
      canRequestCash: !!m.can_request_cash,
      level: m.level || "",
      doctorReady: { activity: !!m.doctor_ready?.activity, service: !!m.doctor_ready?.service },
    };
  }).catch((e) => {
    console.warn("[expense-claims] settlement settings unreadable:", e.message);
    return SETTLE_SETTINGS_FALLBACK;
  });
}
/* The caller's own doctors matching q (2+ letters). -> [{ id, name, city }] */
export async function searchSettlementDoctors(conn, q) {
  const t = String(q || "").trim();
  if (t.length < 2) return [];
  const m = (await settleCall(conn, "GET", { action: "doctors", q: t })).message || {};
  return (m.doctors || []).map((d) => ({ id: d.id, name: d.name || d.id, city: d.city || "" }));
}
/* The doctor services a bill over the activity limit can be tagged to:
   asked for that doctor, approved or still in approval, with room left.
   -> [{ name, service, date, state, approved, amount, billed, left }] */
export async function fetchDoctorServices(conn, doctor, date) {
  // only the services of the bill's month (date: the bill date, YYYY-MM-DD)
  const m = (await settleCall(conn, "GET", { action: "services", doctor, ...(date ? { date } : {}) })).message || {};
  return (m.services || []).map((x) => ({
    name: x.name, doctor: x.doctor, doctorName: x.doctor_name || "", service: x.service || x.name, date: String(x.date || "").slice(0, 10),
    state: x.state || "", approved: !!x.approved, refused: !!x.refused, amount: num0(x.amount), billed: num0(x.billed), left: num0(x.left),
  }));
}

/* A new bill. -> the bill as fetchSettlementBills shapes it
   kind: the own kind (a doctor bill: optional); doctor: the doctor's id;
   doctorService: only for a doctor bill over the activity limit; serviceDate:
   instead of it when the settings switch is off. The server decides the type
   from the amount and refuses a wrong combination. */
export async function addSettlementBill(conn, { date, title, amount, bill, proof, handNote, kind, doctor, doctorService, serviceDate }) {
  const m = (await settleCall(conn, "POST", {
    action: "add_bill", bill_date: date, title, amount: String(amount), bill,
    ...(proof ? { proof } : {}), ...(handNote ? { hand_note: handNote } : {}),
    ...(kind ? { kind } : {}), ...(doctor ? { doctor } : {}), ...(doctor && doctorService ? { doctor_service: doctorService } : {}),
    ...(doctor && serviceDate ? { service_date: serviceDate } : {}),
  })).message || {};
  if (!m.bill?.name) throw new Error("The bill was not saved.");
  return m.bill;
}

/* Help on a bill being added (24 Nov 2026, the user: "like the help in the
   planner"): the photo goes up (private, the rep's own) and an ERP Task is
   raised through the planner's Server Script "Field Trip Help API"
   (method field_trip_help, source=settlement) -- the same team, assigned and
   shared the same way -- with the photo attached and the form as filled.
   -> the Task ({ name, status, subject }) */
export async function raiseBillHelp(conn, { file, date, title, message, details }) {
  const text = String(message || "").trim();
  if (text.length < 5) throw new Error("Write what is wrong (a few words at least).");
  const up = file ? await uploadPrivateFile(conn, file) : null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : new Date().toISOString().slice(0, 10);
  const m = (await rest(conn, "/api/method/field_trip_help", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      action: "raise", source: "settlement", trip_id: `bill-${day}`, from: day, to: day,
      title: String(title || "Bill").slice(0, 60), message: text, details: String(details || "").slice(0, 8000),
      ...(up?.file_url ? { file: up.file_url } : {}),
    }),
  })).message || {};
  if (!m.task?.name) throw new Error("The request was not raised — try again.");
  return m.task;
}

/* The rep's own settlement help requests (the Settlements page's Help card),
   newest first -> [{ name, status, title, day, created, closed, asked,
   replies: [{ by, mine, at, text }], teamReplies, state }]
   state: "raised" (no answer yet) | "replied" (the team answered, not done) | "done" */
const htmlText = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
export async function listBillHelp(conn) {
  const m = (await rest(conn, "/api/method/field_trip_help", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "settle" }),
  })).message || {};
  return (m.tasks || []).map((t) => {
    // "Settlement help · <what for> · 2026-11-21 — Name (E0…)"
    const subj = String(t.subject || "").replace(/^Settlement help · /, "").replace(/ — [^—]*$/, "");
    const day = (subj.match(/(\d{4}-\d{2}-\d{2})$/) || [])[1] || "";
    const title = subj.replace(/ · \d{4}-\d{2}-\d{2}$/, "").trim() || "Bill";
    // the description's 2nd paragraph is what the rep wrote
    const ps = String(t.description || "").split(/<\/p>/i);
    const asked = htmlText(ps[1] || "");
    const replies = (t.replies || []).map((c) => ({ by: c.by || "", mine: !!c.mine, at: String(c.at || ""), text: htmlText(c.content) }));
    const teamReplies = replies.filter((c) => !c.mine).length;
    const done = t.status === "Completed" || t.status === "Cancelled";
    return {
      name: t.name, status: t.status, title, day, created: String(t.creation || ""), closed: done, asked, replies, teamReplies,
      state: done ? "done" : teamReplies ? "replied" : "raised",
    };
  });
}
/* The rep answers inside their own request (a comment on the Task). */
export async function replyBillHelp(conn, name, message) {
  const text = String(message || "").trim();
  if (text.length < 2) throw new Error("Write your reply first.");
  return (await rest(conn, "/api/method/field_trip_help", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "reply", name, message: text }),
  })).message || {};
}

/* A bill not sent yet, taken out (its photos and its duplicate-register place go too). */
export async function removeSettlementBill(conn, name) {
  return (await settleCall(conn, "POST", { action: "remove_bill", name })).message || {};
}

/* The app server compares each bill with its signed read and saves the score.
   names: the bills (SE-#####); reads: { <name>: signed } from extractBill.
   -> { rows: [{ name, score, reason, status }] } | { skipped, reason } */
export async function checkSettlementBills(conn, names, reads) {
  const res = await fetch("/api/claims/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-erp-token": conn.authToken },
    body: JSON.stringify({ endpoint: conn.endpointUrl, bills: names, ...(reads ? { reads } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `The bill check failed (HTTP ${res.status}).`);
  return json;
}

/* The bills as ONE open "claim" in the shape the screens read (the running
   claim of old): a line per bill. Booked bills (the CEO approved) are already
   taken off the cash advances in the ERP (booked: true), so the ledger does not
   take them off again; what the advances did not cover is owed to the person
   until Accounts pay it (owed), and each payment is a payout. */
export const SETTLEMENT_CLAIM = "Settlement bills";
export function settlementClaim(bills, employee) {
  const lines = bills
    .map((b, i) => ({
      id: b.name,
      idx: i + 1,
      date: String(b.date || "").slice(0, 10),
      type: "Miscellaneous",
      sub: "",
      note: b.title || "",
      amount: num(b.amount),
      sanctioned: ["Verified", "Paid"].includes(b.status) ? num(b.amount) : 0,
      bill: b.bill || "",
      proof: b.proof || "",
      // Paid is still a verified bill to the screens, with paid set
      state: b.status === "Paid" ? "Verified" : b.status || "Checking",
      paid: b.status === "Paid",
      booked: !!b.entry,
      entry: b.entry || "",
      fromAdvance: num(b.from_advance),
      payable: num(b.payable),
      paidAmount: num(b.paid),
      settlement: b.settlement || "",
      review: String(b.review || "").trim(),
      // the settlement type (23 Nov 2026) -- `type` above stays the claim
      // type the screens colour by
      settleType: b.type || "Own",
      expenseKind: b.kind || "",
      doctor: b.doctor || "",
      doctorName: b.doctor_name || b.doctor || "",
      doctorService: b.doctor_service || "",
      serviceDate: String(b.service_date || "").slice(0, 10),
      modified: b.modified,
      ai: null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    id: SETTLEMENT_CLAIM,
    settlement: true,
    running: true,
    posting: lines.length ? lines[lines.length - 1].date : "",
    status: "Draft",
    docstatus: 0,
    inFlow: false,
    editable: false,
    employee,
    employeeName: "",
    approver: null,
    claimed: lines.reduce((s, l) => s + l.amount, 0),
    sanctioned: null,
    reimbursed: 0,
    owed: lines.reduce((s, l) => s + Math.max(0, l.payable - l.paidAmount), 0),
    // no payment date is known for a bill: what Accounts paid stays on the
    // bill's own line (paidAmount; model.ledger counts it), never a dated row
    payouts: [],
    remark: "",
    modified: lines.reduce((m, l) => (String(l.modified) > m ? String(l.modified) : m), ""),
    ai: null,
    payrollEntry: null,
    isAdvance: false,
    advanceOf: null,
    advance: null,
    coveredByAdvance: 0,
    lines,
  };
}

/* A file already in the ERP (the planner stores a trip bill the moment it is
   checked) moved onto a claim, so whoever may see the claim may open it. */
export function attachFileTo(conn, fileId, claimId) {
  return rest(conn, `/api/resource/File/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attached_to_doctype: "Expense Claim", attached_to_name: claimId }),
  });
}

export function deleteClaimFile(conn, fileId) {
  return gql(conn, DELETE_FILE_MUTATION, { name: fileId });
}

/* A file's bytes, through our own route with the user's token. */
export async function fetchFileBlob(conn, fileUrl) {
  const params = new URLSearchParams({ endpoint: conn.endpointUrl, path: fileUrl });
  const res = await fetch(`/api/erp/claim-file?${params}`, { headers: { "x-erp-token": conn.authToken } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `The file could not be opened (HTTP ${res.status}).`);
  }
  return res.blob();
}
