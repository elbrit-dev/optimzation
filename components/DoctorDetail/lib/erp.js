/**
 * ERP access for the doctor page.
 *
 * The page reads with the SIGNED-IN USER'S token, not the shared service
 * credential the previous build used. That is the whole point of the rewrite:
 * several people cover the same doctor, and ERP's own permissions are what stop
 * one of them seeing another's rows. A shared credential sees everything and
 * would quietly hand every viewer the full picture.
 *
 * Nothing about WHO is viewing is passed in as a prop. The token identifies
 * them, so the page asks ERP: logged user -> Employee -> role profile. Passing
 * a role in would let a page author hand themselves SM sight of the service
 * figures by editing a Studio field.
 */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { getEndpointConfigFromUrlKeyAsync } from "@/app/graphql-playground/constants";

const LIVE_ERP_TARGET = "ERP";

function stripAuthScheme(token) {
  return String(token ?? "").trim().replace(/^(token|bearer)\s+/i, "");
}

/**
 * Point the ERP client somewhere, and say whose credential it is.
 *
 * Order matters. An explicitly bound pair wins, then whatever AuthProvider
 * already published (the calendar mounts it; a page that hosts both gets the
 * user's token for free), and only then the shared row in /tokens. That last
 * one is a fallback for the Studio canvas, where no one is signed in — it is
 * reported back as `shared` so the page can say so rather than pretending the
 * numbers are scoped to the reader.
 */
export async function ensureErpAuth({ erpUrl, authToken, erpTarget } = {}) {
  const explicitToken = stripAuthScheme(authToken);
  if (erpUrl && explicitToken) {
    AUTH_CONFIG.erpUrl = String(erpUrl).trim();
    AUTH_CONFIG.authToken = explicitToken;
    return { scope: "user" };
  }

  if (AUTH_CONFIG.erpUrl && AUTH_CONFIG.authToken) return { scope: "user" };

  const config = await getEndpointConfigFromUrlKeyAsync(
    String(erpTarget || LIVE_ERP_TARGET).trim().toUpperCase()
  );
  const token = stripAuthScheme(config?.authToken);
  if (!config?.endpointUrl || !token) {
    throw new Error(
      "No ERP endpoint is configured for this page. Bind ERP URL + Auth Token to the signed-in user's credential, or add a global token in /tokens."
    );
  }
  AUTH_CONFIG.erpUrl = config.endpointUrl;
  AUTH_CONFIG.authToken = token;
  return { scope: "shared" };
}

/** The GraphQL endpoint with its /api/method/graphql tail removed. */
export function erpRestBase() {
  const { erpUrl } = AUTH_CONFIG;
  if (!erpUrl) throw new Error("Missing ERP auth configuration");
  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

/**
 * An HTTP failure that still says WHICH failure it was.
 *
 * 403 is not a bug and must not be reported as one: it means this user's ERP
 * role cannot read that doctype, which is the whole point of reading as the
 * user. The page says so in those words instead of "couldn't load".
 */
export class ErpHttpError extends Error {
  constructor(status, detail) {
    super("HTTP " + status + (detail ? " — " + detail : ""));
    this.name = "ErpHttpError";
    this.status = status;
    this.denied = status === 403 || status === 401;
  }
}

export async function erpRest(path, params) {
  const { authToken } = AUTH_CONFIG;
  if (!authToken) throw new Error("Missing ERP auth configuration");
  const query = params ? "?" + new URLSearchParams(params) : "";
  const response = await fetch(erpRestBase() + path + query, {
    headers: { Accept: "application/json", Authorization: "token " + authToken },
  });
  if (!response.ok) throw new ErpHttpError(response.status);
  return response.json();
}

/** One whole document, child tables included. */
export async function erpDoc(doctype, name) {
  const json = await erpRest(
    "/api/resource/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(name)
  );
  return json?.data ?? null;
}

/** A Frappe REST list read. Returns [] rather than throwing on an empty table. */
export async function erpList(doctype, { fields, filters, limit = 500, orderBy } = {}) {
  const params = { limit_page_length: String(limit) };
  if (fields) params.fields = JSON.stringify(fields);
  if (filters) params.filters = JSON.stringify(filters);
  // Both parent and child carry `modified`, so an unqualified order_by is
  // ambiguous once a child filter joins the tables and Frappe answers 500.
  // A child column also has to stay backticked or it returns zero rows with no
  // error at all.
  if (orderBy) params.order_by = orderBy;
  const json = await erpRest("/api/resource/" + encodeURIComponent(doctype), params);
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * Try several ways of getting the same thing; take the first that answers.
 *
 * Attempts deliberately mix TRANSPORTS, not just query shapes. Neither one is
 * reliable on its own here and they fail for unrelated reasons:
 *
 *   - GraphQL rejects the WHOLE request over one field. A Link asked for as a
 *     scalar ("salutation", "owner") 400s the query and takes every other field
 *     on the page down with it.
 *   - REST cannot express a child-table join without an INNER JOIN, so a parent
 *     with no child rows silently vanishes, and some doctypes answer 403 to a
 *     list read that GraphQL will happily serve.
 *
 * So each read names more than one route to its data. A 403 is re-thrown rather
 * than retried: the next attempt would be refused the same way, and the caller
 * needs to tell "you may not see this" apart from "this broke".
 */
export async function firstAnswer(attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const value = await attempt();
      if (value != null) return value;
    } catch (error) {
      if (error?.denied) throw error;
      errors.push(error);
    }
  }
  if (errors.length) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("DoctorDetail: every route failed", errors.map((e) => e?.message ?? String(e)));
    }
    throw errors[errors.length - 1];
  }
  return null;
}

/**
 * Run a ladder of GraphQL query shapes, returning the first that answers.
 *
 * Link fields are exposed as `x__name` on some instances and as a scalar on
 * others, so a single shape is a coin toss across environments.
 */
export async function firstSuccessful(queries, variables, extract) {
  let lastError = null;
  const errors = [];
  for (const query of queries) {
    try {
      const data = await graphqlRequest(query, variables);
      const value = extract(data);
      if (value != null) return value;
    } catch (error) {
      lastError = error;
      errors.push(error);
    }
  }
  if (lastError) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("DoctorDetail: every query shape failed", errors.map((e) => e?.message ?? String(e)));
    }
    throw lastError;
  }
  return null;
}

export const ROLE_LADDER = ["BE", "ABM", "RBM", "ZSM"];
export const ROLE_NAMES = {
  BE: "Business Executive",
  ABM: "Area Business Manager",
  RBM: "Regional Business Manager",
  SM: "Sales Manager",
  ZSM: "Zonal Sales Manager",
  Admin: "Administrator",
};

/** Roles allowed to see what the company SPENT on a doctor. */
const SERVICE_VISIBLE_TO = ["SM", "ZSM", "Admin"];

/**
 * "BE12-CND-CH-CHE" -> "BE".
 *
 * The same rule the calendar's doctor-visit dialog uses, kept identical on
 * purpose: two places deciding a viewer's role by different rules is how the
 * same person ends up an ABM on one screen and a BE on the next.
 */
export function rolePrefix(roleId) {
  if (!roleId) return null;
  const prefix = String(roleId).split("-")[0].replace(/[0-9]/g, "").toUpperCase();
  return prefix || null;
}

/**
 * "CND Chennai - ELPL" -> { division: "CND", region: "Chennai" }.
 *
 * The company suffix is dropped and the LAST word is the region, because a
 * division can be two words: "Aura & Proxima Kerala - ELPL" is the A&P
 * division in Kerala, not a division called "Aura & Proxima Kerala".
 */
export function parseDepartment(value) {
  const text = String(value ?? "").trim();
  if (!text) return { division: null, region: null, label: null };
  const withoutCompany = text.replace(/\s*-\s*[A-Z]{2,6}\s*$/, "").trim();
  const words = withoutCompany.split(/\s+/);
  if (words.length < 2) return { division: withoutCompany, region: null, label: withoutCompany };
  const region = words[words.length - 1];
  const division = words.slice(0, -1).join(" ");
  return { division, region, label: withoutCompany };
}

/** "Aura & Proxima" is written A&P everywhere a chip has to fit. */
export function shortDivision(division) {
  if (!division) return "Unassigned";
  if (/^aura\s*&\s*proxima$/i.test(division)) return "A&P";
  return division;
}

const VIEWER_FIELDS = [
  "name", "employee_name", "user_id", "designation", "department",
  "custom_role_profile", "role_id", "fsl_hq", "custom_territory", "company",
];

/**
 * WHO is reading this page, according to ERP.
 *
 * Two hops: the token names a User, and the Employee row keyed to that User
 * names their role profile. `user_id` is the link, NOT `company_email` — field
 * staff routinely have that column empty, so matching on it loses exactly the
 * BEs this page is for.
 *
 * A viewer we cannot resolve is treated as the LEAST privileged reader rather
 * than the most: no Employee row means no service figures. Failing open here
 * would show what the company spends on a doctor to anyone whose Employee
 * record happens to be missing.
 */
export async function resolveViewer() {
  let email = null;
  try {
    const json = await erpRest("/api/method/frappe.auth.get_logged_user");
    email = json?.message ?? null;
  } catch {
    email = null;
  }

  let row = null;
  if (email) {
    try {
      const rows = await erpList("Employee", {
        fields: VIEWER_FIELDS,
        filters: [["user_id", "=", email]],
        limit: 1,
      });
      row = rows[0] ?? null;
    } catch {
      row = null;
    }
  }

  const roleId = row?.custom_role_profile ?? row?.role_id ?? null;
  const role = rolePrefix(roleId) ?? (email && !row ? null : null);
  const department = parseDepartment(row?.department);

  return {
    email,
    employee: row?.name ?? null,
    employeeName: row?.employee_name ?? null,
    designation: row?.designation ?? null,
    roleId,
    role,
    division: department.division,
    hq: row?.fsl_hq ?? row?.custom_territory ?? null,
    canSeeService: !!role && SERVICE_VISIBLE_TO.includes(role),
    resolved: !!row,
  };
}

/**
 * Append a note to the doctor's Lead.
 *
 * `notes` is a child table, so there is no way to add one row without sending
 * the parent — which puts the whole Lead through validation. A great many
 * doctor Leads were bulk-imported with `custom_doctor_code` empty while the
 * field is mandatory, and those Leads cannot be saved AT ALL until ERP is
 * fixed. That failure is caught and named here rather than surfacing as a wall
 * of Frappe HTML, because it is not something the reader did wrong and not
 * something they can fix from this page.
 */
export async function appendLeadNote(doctorId, { subject, body, tag, author }) {
  const { authToken } = AUTH_CONFIG;
  if (!authToken) throw new Error("Missing ERP auth configuration");

  const current = await erpRest("/api/resource/Lead/" + encodeURIComponent(doctorId));
  const existing = Array.isArray(current?.data?.notes) ? current.data.notes : [];
  const heading = [tag && tag !== "Note" ? "[" + tag + "]" : null, subject?.trim()]
    .filter(Boolean)
    .join(" ");
  const text = [heading, body?.trim()].filter(Boolean).join("\n");

  const response = await fetch(
    erpRestBase() + "/api/resource/Lead/" + encodeURIComponent(doctorId),
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "token " + authToken,
      },
      body: JSON.stringify({
        notes: [...existing, { note: text, added_by: author ?? undefined }],
      }),
    }
  );

  if (!response.ok) {
    let detail = "";
    try { detail = JSON.stringify(await response.json()); } catch { detail = ""; }
    if (/custom_doctor_code|Doctor Code/i.test(detail)) {
      throw new Error(
        "ERP will not save this doctor: the Lead's mandatory Doctor Code is empty. That has to be filled in ERP before any note can be added."
      );
    }
    if (response.status === 403) {
      throw new Error("You do not have permission to add a note to this doctor.");
    }
    throw new Error("ERP rejected the note (HTTP " + response.status + ").");
  }
  return true;
}

/**
 * Role and department for the employees who touched this doctor's rows.
 *
 * Keyed by EMPLOYEE ID only. There is deliberately no lookup by login: the only
 * record that names a person here is the doctor visit, through
 * `custom_employee_id`. A Quotation names nobody, and its `owner` is whoever
 * saved it — often an admin or an integration account — so resolving by login
 * would quietly file other people's POBs under theirs.
 *
 * Anything that fails to resolve stays unresolved: a visit whose rep has left
 * the company is still a real visit and must not vanish from the count.
 */
export async function fetchEmployeeIndex({ employeeIds = [] } = {}) {
  const byId = new Map();
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return { byId };

  const rows = await erpList("Employee", {
    fields: VIEWER_FIELDS,
    filters: [["name", "in", ids]],
    limit: 500,
  }).catch(() => []);

  rows.forEach((row) => {
    const roleId = row.custom_role_profile ?? row.role_id ?? null;
    const department = parseDepartment(row.department);
    const entry = {
      employee: row.name,
      name: row.employee_name,
      role: rolePrefix(roleId),
      roleId,
      division: department.division,
      department: department.label,
      hq: row.fsl_hq ?? row.custom_territory ?? null,
    };
    byId.set(row.name, entry);
  });

  return { byId };
}
