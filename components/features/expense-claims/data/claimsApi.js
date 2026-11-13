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
export const CASH_REQUESTS = false;
export const CLAIMS_ROLE_PROFILES = null;
export const canUseClaims = (me) =>
  !!me
  && (!CLAIMS_DEPARTMENTS || CLAIMS_DEPARTMENTS.includes(String(me.department || "").trim()))
  && (!CLAIMS_ROLE_PROFILES || CLAIMS_ROLE_PROFILES.includes(String(me.roleProfile || "").trim()));

export function fetchClaims(conn, employee) {
  return cached(conn, `ec-claims|${employee}`, async () => {
    const d = await queryClaims(conn, [eq("employee", employee)], 1000);
    const nodes = (d.ExpenseClaims?.edges || []).map((e) => e.node);
    if (fieldTier < 2) await addRunningFields(conn, employee, nodes);
    return nodes.map(shapeClaim);
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
      filters: JSON.stringify([["employee", "=", employee], ["docstatus", "<", 2]]),
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
   a new one. -> [claim] */
export async function fetchClaimsByRemark(conn, employee, remark, max = 10) {
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
    throw new Error(String(msg).replace(/<[^>]*>/g, "").replace(/^[\w.]+Error:\s*/, ""));
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
   our server (/api/claims/read-bill) sends it to Cloudflare toMarkdown, then
   Clairic (values) and Clef Flash (title) on that Markdown. The form fills
   title, amount and date from it; the person may change them. The read comes
   back signed by the server and goes along to checkClaim, which compares it
   with what was submitted in plain code.
   -> { amount, date, vendor, what, kind, readable, signed } (null = not read;
      signed = { read, sig } for checkClaim; skipped = the reader is off) */
export async function extractBill(conn, file) {
  const form = new FormData();
  form.append("files", file, file.name || "bill");
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
  return {
    ...claim,
    department: String(doc.department || "").replace(/ - ELPL$/, ""),
    lines: claim.lines.map((l) => {
      const r = rows.get(l.id) || {};
      return {
        ...l,
        trip: r.custom_trip || "",
        decision: r.custom_trip_decision || "",
        decisionNote: r.custom_trip_note || "",
        decidedBy: r.custom_trip_decided_by || "",
        decidedOn: r.custom_trip_decided_on || "",
        // a TA amount the officer (or the final check) changed, and why
        ...(Number(r.custom_adjusted)
          ? { adjusted: true, final: num(r.custom_adjusted_amount), adjustReason: r.custom_adjust_reason || "", adjustedBy: r.custom_adjusted_by || "" }
          : { adjusted: false, final: l.amount }),
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
