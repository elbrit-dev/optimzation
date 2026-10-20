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

const CLAIM_FIELDS = `
  name posting_date status docstatus approval_status modified remark employee_name
  total_claimed_amount total_sanctioned_amount total_amount_reimbursed grand_total
  expenses { name idx expense_date expense_type__name description amount sanctioned_amount }
`;

const CLAIMS_QUERY = `
  query ExpenseClaimsOf($f: [DBFilterInput], $first: Int) {
    ExpenseClaims(first: $first, filter: $f, sortBy: { field: MODIFIED, direction: DESC }) {
      edges { node { ${CLAIM_FIELDS} } }
    }
  }
`;

const ME_QUERY = `
  query ExpenseClaimEmployee($f: [DBFilterInput]) {
    Employees(first: 5, filter: $f) {
      edges { node { name employee_name status department__name designation__name company__name custom_role_profile__name } }
    }
  }
`;

const TYPES_QUERY = `query ExpenseClaimTypes { ExpenseClaimTypes(first: 100) { edges { node { name } } } }`;

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

function statusOf(node) {
  if (Number(node.docstatus) === 2) return "Cancelled";
  if (String(node.approval_status || "").toUpperCase() === "REJECTED") return "Rejected";
  const s = titleCase(node.status);
  return s || (Number(node.docstatus) === 0 ? "Draft" : "Submitted");
}

export function shapeClaim(node) {
  const lines = (node.expenses || [])
    .map((r) => ({
      id: r.name,
      idx: num(r.idx),
      date: String(r.expense_date || "").slice(0, 10),
      type: r.expense_type__name || "Others",
      note: String(r.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      amount: num(r.amount),
      sanctioned: num(r.sanctioned_amount),
    }))
    .sort((a, b) => a.idx - b.idx);
  const docstatus = num(node.docstatus);
  return {
    id: node.name,
    posting: String(node.posting_date || "").slice(0, 10),
    status: statusOf(node),
    docstatus,
    editable: docstatus === 0,
    claimed: num(node.total_claimed_amount) || lines.reduce((s, l) => s + l.amount, 0),
    // Until HR submits, sanctioned is whatever the draft happens to hold --
    // only a submitted claim's figure means anything.
    sanctioned: docstatus === 1 ? num(node.total_sanctioned_amount) : null,
    reimbursed: num(node.total_amount_reimbursed),
    remark: String(node.remark || "").trim(),
    modified: node.modified,
    lines,
  };
}

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

/* Who gets claims (the strip, the profile tab, the Claims page), by the
   signed-in person's own Employee role profile. null = every employee --
   open since 2026-10-20, once the ERP let every employee create their own
   claims and scoped each person to their own. To trial with a few again,
   list their role profiles, e.g. ["IT", "MIS"]. */
export const CLAIMS_ROLE_PROFILES = null;
export const canUseClaims = (me) =>
  !!me && (!CLAIMS_ROLE_PROFILES || CLAIMS_ROLE_PROFILES.includes(String(me.roleProfile || "").trim()));

export function fetchClaims(conn, employee) {
  return cached(conn, `ec-claims|${employee}`, async () => {
    const d = await gql(conn, CLAIMS_QUERY, { f: [eq("employee", employee)], first: 1000 });
    return (d.ExpenseClaims?.edges || []).map((e) => shapeClaim(e.node));
  });
}

export function fetchClaimTypes(conn) {
  return cached(conn, "ec-types", async () => {
    const d = await gql(conn, TYPES_QUERY);
    return (d.ExpenseClaimTypes?.edges || []).map((e) => e.node.name).filter(Boolean);
  });
}

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
}

/* Creates a Draft claim, or rewrites a Draft's rows. Rows keep their ERP
   names so editing one does not churn the child table. */
export async function saveClaim(conn, { claim, employee, postingDate, remark, lines }) {
  const doc = {
    doctype: "Expense Claim",
    employee,
    posting_date: postingDate,
    remark: remark || "",
    expenses: lines.map((l) => ({
      doctype: "Expense Claim Detail",
      ...(l.id ? { name: l.id } : {}),
      expense_date: l.date,
      expense_type: l.type,
      description: l.note || "",
      amount: num(l.amount),
    })),
  };
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

export const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
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
