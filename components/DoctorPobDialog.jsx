"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Toaster, toast } from "sonner";

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@calendar/components/ui/responsive-modal";
import { Button } from "@calendar/components/ui/button";
import { Input } from "@calendar/components/ui/input";
import { Textarea } from "@calendar/components/ui/textarea";
import { Form } from "@calendar/components/ui/form";
import { RHFComboboxField } from "@calendar/components/calendar/form-fields";

import { AUTH_CONFIG, LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { ELBRIT_ROLEID, normalizeRoleProfiles } from "@calendar/components/calendar/module/event/graphql/events.query";
import { getCached } from "@calendar/lib/data-cache";
import { resolveVisibleRoleIds } from "@calendar/lib/employeeHeirachy";
import { resolvePobDepartments } from "@calendar/lib/calendar/pobDepartments";
import { getAvailableItems, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import {
  fetchEmployeeNodes,
  fetchItemsByDepartment,
} from "@calendar/components/calendar/module/event/services/master-data.service";
import {
  fetchAllCustomers,
  fetchCustomersByTerritory,
  formatDateForERP,
  saveDocToQuotation,
} from "@calendar/components/calendar/module/event/services/event.service";

import { getEndpointConfigFromUrlKeyAsync } from "@/app/graphql-playground/constants";

/**
 * DoctorPobDialog — raise a POB straight from the doctor page, with no visit.
 *
 * The normal POB is captured on a doctor visit, where the employee, the HQ and
 * the product department are all already known from the event. Here there is no
 * event, so the popup asks for them in that order (employee -> HQ -> department
 * -> customer -> date/time), then takes the items exactly as the visit editor
 * does. It writes ONE document — a Quotation — and nothing else: no Event, no
 * `custom_event`, and by default no `custom_doctorvisit` either, so ERP has no
 * link to resolve and the write is a plain billing document.
 *
 * Nothing is offered company-wide. HQ and DEPARTMENT come from the DOCTOR'S own
 * `custom_role_profile` rows — (department, HQ) triples, usually just one, in
 * which case both are auto-selected and the user never touches them; a doctor
 * spanning several leaves the choice open. The employee's own coverage then
 * narrows that set, and the employee list itself is their role subtree. Customer
 * follows the chosen HQ and items follow the chosen department.
 *
 * With no links, the reason block is the only record of what this POB belongs
 * to, so a REASON is mandatory and is stored with the doctor, employee, HQ,
 * department and exact timestamp in the Quotation's free-text field (`terms` by
 * default — see `reasonField`), prefixed with DIRECT_POB_MARKER so these can be
 * told apart from visit POBs and reported on.
 */

/** First line of the stored reason. Grep ERP for this to find direct POBs. */
export const DIRECT_POB_MARKER = "DIRECT POB — raised from the Doctor page (no doctor visit)";

const EMPTY_ROW = { item__name: "", qty: 1, rate: 0, amount: 0 };

const ROLE_CACHE_KEY = "ELBRIT_ROLE_PROFILES";
const EMPLOYEE_HQ_CACHE_KEY = "EMPLOYEE_HQ_MAP";

/**
 * The employee's HQ.
 *
 * NOT part of the calendar's own employee query, which asks for
 * `custom_hq__name` — a field the Employee doctype does not have (the real one
 * is `fsl_hq`), so its HQ prefill silently never fires. Asked for separately
 * here so that bug can be fixed upstream without this depending on it, and so a
 * failure degrades to the full territory list instead of breaking the form.
 */
const EMPLOYEE_HQ_QUERY = `
query EmployeeHqs($first: Int!, $filters: [DBFilterInput!]) {
  Employees(first: $first, filter: $filters) {
    edges {
      node {
        name
        hq: fsl_hq__name
      }
    }
  }
}
`;

/**
 * The doctor's own (department, HQ) pairs.
 *
 * `Lead.custom_role_profile` is a child table of Role Profile Multiselect rows —
 * { role_profile_list, department, hq } — and it, not the employee's coverage,
 * is what says which HQ and department a POB for this doctor belongs to. Asked
 * for on the single-document `Lead(name:)` query for the same reason
 * `fetchDoctorById` uses it: filtering the Leads LIST by name returns [] in
 * frappe_graphql.
 *
 * Two shapes are tried because the child fields are Links: `department__name`
 * on an instance that exposes them flattened, plain `department` where they are
 * scalars. Asking for the wrong one fails the whole query, so the second is a
 * retry rather than extra fields on the first.
 */
const DOCTOR_ROLES_QUERY = (flattened) => `
query DoctorRoles($name: String!) {
  Lead(name: $name) {
    name
    territory__name
    custom_role_profile {
      department: ${flattened ? "department__name" : "department"}
      hq: ${flattened ? "hq__name" : "hq"}
    }
  }
}
`;

/** "Aura & Proxima Kerala - ELPL" -> "Aura & Proxima Kerala". */
function stripCompanySuffix(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+-\s+[A-Za-z]{2,8}$/, "")
    .trim();
}

/**
 * Whether two department names mean the same department.
 *
 * The doctor's child row holds the Department DOCNAME ("Aura & Proxima Kerala -
 * ELPL") while the role hierarchy holds its `department_name` ("Aura & Proxima
 * Kerala"), so an equality test would never match. Same normalise-and-contain
 * rule `fetchItemsByDepartment` applies internally, which is module-private
 * there.
 */
function departmentsAlike(left, right) {
  const a = stripCompanySuffix(left).toLowerCase();
  const b = stripCompanySuffix(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * The stored token is a whole Authorization header value ("token key:secret"),
 * while the calendar's GraphQL client adds the scheme itself. Hand it the bare
 * credential either way.
 */
function stripAuthScheme(token) {
  return String(token ?? "")
    .trim()
    .replace(/^(token|bearer)\s+/i, "");
}

/**
 * The global-token row a POB is written through when nothing is bound.
 *
 * The rows live in Firestore and are managed at /tokens, keyed by an uppercased
 * name — the page there prompts for "ERP / UAT / DEV". Named explicitly rather
 * than taking whichever row happens to carry the default flag, because that
 * flag is a convenience for the query playground and had this writing POBs to
 * an ERP that did not hold the doctor Leads ("Could not find DoctorVisit").
 * An unknown key falls back to the default row, so this is safe on an instance
 * with no row called ERP.
 */
const LIVE_ERP_TARGET = "ERP";

/**
 * Point the calendar's ERP client at an endpoint.
 *
 * On the calendar page AuthProvider has already done this and we must not
 * disturb it. On the doctor page nothing has, so resolve the live row from the
 * same global tokens the page's own data provider runs on.
 */
async function ensureErpAuth({ erpUrl, authToken, erpTarget }) {
  const explicitToken = stripAuthScheme(authToken);
  if (erpUrl && explicitToken) {
    AUTH_CONFIG.erpUrl = String(erpUrl).trim();
    AUTH_CONFIG.authToken = explicitToken;
    return;
  }

  if (AUTH_CONFIG.erpUrl && AUTH_CONFIG.authToken) return;

  const config = await getEndpointConfigFromUrlKeyAsync(
    String(erpTarget || LIVE_ERP_TARGET).trim().toUpperCase()
  );
  const token = stripAuthScheme(config?.authToken);
  if (!config?.endpointUrl || !token) {
    throw new Error(
      "No ERP endpoint is configured for this page. Add a global token in /tokens, or bind ERP URL + Auth Token on the card."
    );
  }

  AUTH_CONFIG.erpUrl = config.endpointUrl;
  AUTH_CONFIG.authToken = token;
}

async function fetchElbritRoleEdges() {
  return getCached(ROLE_CACHE_KEY, async () => {
    const raw = await graphqlRequest(ELBRIT_ROLEID, { first: 1000 });
    return normalizeRoleProfiles(raw)?.ElbritRoleIDS?.edges ?? [];
  });
}

/** { [employeeId]: "HQ-Trichy" }. Empty when ERP won't give up the field. */
async function fetchEmployeeHqMap() {
  return getCached(EMPLOYEE_HQ_CACHE_KEY, async () => {
    const data = await graphqlRequest(EMPLOYEE_HQ_QUERY, {
      first: 1000,
      filters: [{ fieldname: "status", operator: "EQ", value: "Active" }],
    });

    const map = {};
    data?.Employees?.edges?.forEach(({ node }) => {
      if (node?.name && node?.hq) map[node.name] = node.hq;
    });
    return map;
  });
}

/** [{ department, hq }] for one doctor, plus their own territory. */
async function fetchDoctorRoles(doctorId) {
  if (!doctorId) return { territory: null, roles: [] };

  return getCached(`DOCTOR_ROLES:${doctorId}`, async () => {
    let data;
    try {
      data = await graphqlRequest(DOCTOR_ROLES_QUERY(true), { name: doctorId });
    } catch {
      data = await graphqlRequest(DOCTOR_ROLES_QUERY(false), { name: doctorId });
    }

    const lead = data?.Lead;
    return {
      territory: lead?.territory__name ?? null,
      roles: (lead?.custom_role_profile ?? [])
        .map((row) => ({
          // The role hierarchy holds department_name, so store the stripped
          // form and let both sides compare as equals.
          department: stripCompanySuffix(row?.department),
          hq: row?.hq ?? null,
        }))
        .filter((row) => row.department || row.hq),
    };
  });
}

/** The Employee ID behind whatever Studio bound to `employee`. */
function resolveEmployeeId(employee) {
  if (!employee) return null;
  if (typeof employee === "string") return employee.trim() || null;
  if (typeof employee !== "object") return null;
  return (
    employee.name ??
    employee.employeeId ??
    employee.employee ??
    employee.id ??
    null
  );
}

function resolveEmployeeEmail(employee) {
  if (!employee || typeof employee !== "object") return null;
  return employee.company_email ?? employee.user_id ?? employee.email ?? null;
}

/** `new Date()` in the shape `<input type="datetime-local">` wants. */
function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const SALUTATIONS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "prof", "prof."]);

function initialsOf(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !SALUTATIONS.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * What goes into the Quotation's free-text field.
 *
 * `transaction_date` is a Date, so the time the user picked would otherwise be
 * dropped; it is written out in full here. The employee and the doctor are
 * recorded here too — Quotation has no employee field, its `owner` is whichever
 * account the page's token belongs to rather than the person the POB is for,
 * and the doctor Link is off by default (see `linkDoctor`).
 */
function buildReasonHtml({
  reason,
  doctorLabel,
  employeeLabel,
  hq,
  department,
  recordedAt,
}) {
  const lines = [
    DIRECT_POB_MARKER,
    `Doctor: ${doctorLabel || "—"}`,
    `Employee: ${employeeLabel || "—"}`,
    `HQ: ${hq || "—"}`,
    `Department: ${department || "—"}`,
    `Recorded at: ${recordedAt || "—"}`,
    `Reason: ${reason}`,
  ];

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

/**
 * Billing constants, carried over from the visit POB so the two produce
 * identical numbers.
 *
 * ⚠️ `COMPANY_ADDRESS` is the Chennai CFA and `COMPANY` is ELPL, both fixed —
 * the visit mapper hardcodes them the same way. A POB for a Kerala or Karnataka
 * HQ therefore still bills from Chennai, and a department belonging to another
 * company (Saviour Wellness, Leo Logistics) would be billed as ELPL. That is
 * pre-existing behaviour, not something this popup decides; if it is wrong it is
 * wrong for the visit POB too.
 */
const COMPANY = "Elbrit Lifesciences Private Limited";
const COMPANY_ADDRESS = "CFA-Chennai-Billing";
const PRICE_LIST = "MRP Billing";

/**
 * The Quotation a direct POB writes.
 *
 * Built here rather than through the visit's `mapDoctorVisitToQuotation`: that
 * mapper exists to hang a quotation off an Event, and it always sets the
 * `custom_doctorvisit` Link — the one field this flow cannot depend on. Only
 * what the Quotation doctype actually needs is sent.
 */
function buildQuotationDoc({ customer, when, rows, reasonField, reasonHtml, extraFields }) {
  return {
    doctype: "Quotation",
    quotation_to: "Customer",
    party_name: customer,
    transaction_date: formatDateForERP(when),
    valid_till: formatDateForERP(when),
    order_type: "Sales",
    company: COMPANY,
    company_address: COMPANY_ADDRESS,
    currency: "INR",
    selling_price_list: PRICE_LIST,
    [reasonField]: reasonHtml,
    ...extraFields,
    items: (rows ?? []).map((row) => ({
      item_code:
        typeof row.item__name === "object" ? row.item__name.value : row.item__name,
      qty: Number(row.qty) || 0,
      rate: Number(row.rate) || 0,
      amount: Number(row.amount) || 0,
    })),
  };
}

/* =====================================================
   LAYOUT BITS

   The form is dressed as what it actually is: a billing docket, written at
   the clinic door on a phone. That shows up in three places and nowhere else —
   uppercase micro-labels ruled across the sheet, numbered order lines, and a
   running total stamped in the foot beside Save. Everything else stays
   hairlines and space, so the total is the one thing the eye lands on.

   No web font: the page self-hosts its own, and a second one would flash. The
   voice comes from tabular numerals on every figure instead, which a column of
   quantities and amounts needs anyway.
===================================================== */

const SHEET_CSS = `
.pob-sheet {
  --ink: #131a2e;
  --muted: #6b7591;
  --line: #e5e9f2;
  --ground: #f7f8fc;
  --accent: #4f46e5;
  --accent-soft: #eef0ff;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.pob-sheet .pob-label,
.pob-sheet label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1.4;
}
.pob-sheet .pob-note { font-size: 11px; color: var(--muted); letter-spacing: 0; text-transform: none; font-weight: 500; }
.pob-sheet .pob-num { font-variant-numeric: tabular-nums; }

/* The combobox trigger is a shared shadcn Button we cannot pass a class to,
   so it is reached by role — the one selector here that is not our own markup. */
.pob-sheet button[role="combobox"],
.pob-sheet input,
.pob-sheet textarea {
  border-radius: 0.75rem;
  border-color: var(--line);
  color: var(--ink);
  font-weight: 500;
}
.pob-sheet button[role="combobox"],
.pob-sheet input:not([type="number"]) { height: 2.75rem; }
.pob-sheet input[type="number"] { height: 2.75rem; text-align: right; }
.pob-sheet button[role="combobox"]:hover { border-color: #c7cedf; background: #fff; }
.pob-sheet textarea { min-height: 5rem; padding: 0.625rem 0.75rem; }
.pob-sheet :is(button, input, textarea, [role="combobox"]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .pob-sheet *, .pob-sheet *::before, .pob-sheet *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* ORDER LINES — a card per line on a phone, one ruled row per line above it. */
.pob-sheet .pob-line {
  display: grid;
  gap: 0.5rem 0.75rem;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) 2.25rem;
  grid-template-areas:
    "no   del"
    "item item"
    "qty  amt";
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
  background: #fff;
}
.pob-sheet .pob-line-no { grid-area: no; }
.pob-sheet .pob-line-item { grid-area: item; min-width: 0; }
.pob-sheet .pob-line-qty { grid-area: qty; }
.pob-sheet .pob-line-amt { grid-area: amt; }
.pob-sheet .pob-line-del { grid-area: del; }
.pob-sheet .pob-line-amount {
  display: flex;
  height: 2.75rem;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.25rem;
  font-weight: 600;
}
.pob-sheet .pob-line-head { display: none; }
@media (min-width: 640px) {
  .pob-sheet .pob-line-head {
    display: grid;
    border-bottom: 0;
    padding: 0 0 0.25rem;
  }
  .pob-sheet .pob-line {
    grid-template-columns: 1.75rem minmax(0, 1fr) 4.5rem 6.5rem 2.25rem;
    grid-template-areas: "no item qty amt del";
    padding: 0.5rem 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    border-bottom: 1px solid var(--line);
  }
  .pob-sheet .pob-lines > .pob-line:last-of-type { border-bottom: 0; }
}
`;

/** A ruled section head: label, hairline to the edge, optional aside. */
function Rule({ title, hint }) {
  return (
    <div className="flex items-center gap-3">
      <span className="pob-label">{title}</span>
      <span className="h-px flex-1 bg-[var(--line)]" />
      {hint ? <span className="pob-note">{hint}</span> : null}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-3">
      <Rule title={title} hint={hint} />
      {children}
    </section>
  );
}

function Notice({ tone = "amber", children }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return (
    <p className={`rounded-xl border px-3 py-2 text-xs font-medium leading-relaxed ${tones[tone]}`}>
      {children}
    </p>
  );
}

export default function DoctorPobDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  doctorHq,
  doctorRoles: doctorRolesProp,
  employee,
  erpUrl,
  authToken,
  erpTarget,
  reasonField = "terms",
  employeeField = "",
  linkDoctor = false,
  renderToaster = true,
  onSaved,
}) {
  const [bootError, setBootError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [employeeNodes, setEmployeeNodes] = useState([]);
  const [roleEdges, setRoleEdges] = useState([]);
  const [fetchedRoles, setFetchedRoles] = useState([]);
  const [doctorTerritory, setDoctorTerritory] = useState(null);
  const [employeeHqMap, setEmployeeHqMap] = useState({});
  const [customerOptions, setCustomerOptions] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const form = useForm({
    mode: "onChange",
    defaultValues: {
      employee: "",
      hq: "",
      department: "",
      customer: "",
      visitAt: "",
      reason: "",
      fsl_doctor_item: [],
    },
  });

  const selectedEmployee = form.watch("employee");
  const hq = form.watch("hq");
  const department = form.watch("department");
  const customer = form.watch("customer");
  const visitAt = form.watch("visitAt");
  const reason = form.watch("reason");
  const pobItems = form.watch("fsl_doctor_item");

  // Reset to a clean sheet on every open — a half-filled POB left over from the
  // previous doctor is worse than no prefill at all.
  useEffect(() => {
    if (!open) return;

    form.reset({
      employee: "",
      hq: "",
      department: "",
      customer: "",
      visitAt: toLocalInputValue(new Date()),
      reason: "",
      fsl_doctor_item: [{ ...EMPTY_ROW }],
    });
    setCustomerOptions([]);
    setItemOptions([]);
    setFetchedRoles([]);
    setDoctorTerritory(null);
    setBootError(null);
    // form is a stable RHF instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Employees, role hierarchy and the employee→HQ map. All cached module-side,
  // so reopening the popup is instant and only the first open pays for them.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        await ensureErpAuth({ erpUrl, authToken, erpTarget });

        const [employees, edges] = await Promise.all([
          fetchEmployeeNodes(),
          fetchElbritRoleEdges(),
        ]);
        if (cancelled) return;
        setEmployeeNodes(employees);
        setRoleEdges(edges);

        // Separate and non-fatal: without it the HQ list can't be scoped, which
        // is worth saying out loud rather than silently widening.
        try {
          const hqMap = await fetchEmployeeHqMap();
          if (!cancelled) setEmployeeHqMap(hqMap);
        } catch (hqError) {
          console.error("Failed to load employee HQs", hqError);
          if (!cancelled) setEmployeeHqMap({});
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load POB master data", error);
        setBootError(error?.message || "Couldn't load employees and territories");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, erpUrl, authToken, erpTarget]);

  // The doctor's own HQ / department rows. Fetched here rather than read off the
  // card, because the Plasmic page query may not select the child table at all.
  useEffect(() => {
    if (!open || !doctorId) return;
    // The card usually already holds them — only go to ERP when the page's own
    // query didn't select the child table.
    if (doctorRolesProp?.length) return;

    let cancelled = false;

    ensureErpAuth({ erpUrl, authToken, erpTarget })
      .then(() => fetchDoctorRoles(doctorId))
      .then(({ territory, roles }) => {
        if (cancelled) return;
        setFetchedRoles(roles);
        setDoctorTerritory(territory);
      })
      .catch((error) => {
        // Non-fatal: the pickers fall back to the employee's own coverage.
        console.error("Failed to load the doctor's HQ / departments", error);
      });

    return () => {
      cancelled = true;
    };
  }, [open, doctorId, doctorRolesProp, erpUrl, authToken, erpTarget]);

  const myEmployeeId = useMemo(() => {
    const explicit = resolveEmployeeId(employee);
    if (explicit) return explicit;

    // Fall back to the calendar's global identity when this card happens to sit
    // on a page that already has one.
    const email = resolveEmployeeEmail(employee) ?? LOGGED_IN_USER?.email;
    if (email) {
      const match = employeeNodes.find(
        (node) =>
          (node.company_email ?? node.user_id ?? "").toLowerCase() ===
          String(email).toLowerCase()
      );
      if (match) return match.name;
    }

    return LOGGED_IN_USER?.id ?? null;
  }, [employee, employeeNodes]);

  const roleIdOf = useCallback(
    (employeeId) => employeeNodes.find((node) => node.name === employeeId)?.role_id ?? null,
    [employeeNodes]
  );

  const myRoleId = useMemo(
    () => (myEmployeeId ? roleIdOf(myEmployeeId) ?? LOGGED_IN_USER?.roleId ?? null : null),
    [myEmployeeId, roleIdOf]
  );

  /** Employee IDs inside a role's subtree (the role itself plus everyone under it). */
  const employeesUnderRole = useCallback(
    (roleId) => {
      if (!roleId) return null;
      const visibleRoleIds = new Set(resolveVisibleRoleIds(roleEdges, roleId));
      if (!visibleRoleIds.size) return null;
      return employeeNodes.filter((node) => visibleRoleIds.has(node.role_id));
    },
    [employeeNodes, roleEdges]
  );

  /**
   * Who this POB may be logged for: the signed-in employee and everyone under
   * them. With no identity to walk down from (the page never bound one) the
   * list stays open rather than empty — an empty picker would block the form
   * outright, and ERP still permission-checks the write.
   */
  const employeeOptions = useMemo(() => {
    const scoped = employeesUnderRole(myRoleId) ?? employeeNodes;

    return scoped
      .map((node) => ({
        value: node.name,
        label: node.employee_name ? `${node.employee_name} (${node.name})` : node.name,
        role: node.designation?.name ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employeesUnderRole, myRoleId, employeeNodes]);

  const selectedRoleId = useMemo(
    () => roleIdOf(selectedEmployee),
    [roleIdOf, selectedEmployee]
  );

  /* -----------------------------------------------------------------
     HQ + DEPARTMENT — the DOCTOR'S own, not the company's

     A doctor's `custom_role_profile` rows are (role profile, department, HQ)
     triples: "Dr Latha Kumrai" carries exactly one — Aura & Proxima Kerala at
     HQ-Kottayam. That IS the answer to which HQ and department a POB for her
     belongs to, so it is what the two pickers offer, auto-selected when there
     is only one and left to the user when the doctor spans several. The
     employee's own coverage then narrows that set rather than replacing it.
  ----------------------------------------------------------------- */

  /**
   * The (HQ, department) pairs the CHOSEN employee covers.
   *
   * Built per team member rather than as an HQ list crossed with a department
   * list: a manager's people sit in different HQs carrying different
   * departments, and crossing the two would invent combinations nobody works —
   * which is how HQ-Kottayam once ended up beside Aura & Proxima Madurai.
   */
  const employeePairs = useMemo(() => {
    const scoped = employeesUnderRole(selectedRoleId);
    if (!scoped) return [];

    const seen = new Set();
    const out = [];
    scoped.forEach((node) => {
      const territory = employeeHqMap[node.name] ?? null;
      resolvePobDepartments(roleEdges, node.role_id).forEach((dept) => {
        const key = `${territory}|${dept}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ hq: territory, department: dept });
      });
    });
    return out;
  }, [employeesUnderRole, selectedRoleId, employeeHqMap, roleEdges]);

  /** The (HQ, department) pairs the DOCTOR carries — card's rows, else fetched. */
  const doctorPairs = useMemo(() => {
    const rows = doctorRolesProp?.length ? doctorRolesProp : fetchedRoles;
    return (rows ?? []).filter((row) => row?.hq || row?.department);
  }, [doctorRolesProp, fetchedRoles]);

  /**
   * What the two pickers offer — always PAIRS, never an HQ from one source
   * beside a department from another.
   *
   * The doctor's own rows come first: they are the answer to which HQ and
   * department a POB for this doctor belongs to. They are kept only where the
   * chosen employee actually covers them; when the employee covers none of them
   * (or the doctor carries no rows at all) the employee's own pairs are used
   * whole, so HQ and department still agree with each other. Changing the
   * employee therefore moves both together.
   */
  const pairs = useMemo(() => {
    const covered = doctorPairs.filter((dp) =>
      employeePairs.some(
        (ep) =>
          (!dp.hq || !ep.hq || dp.hq === ep.hq) &&
          (!dp.department ||
            !ep.department ||
            departmentsAlike(dp.department, ep.department))
      )
    );

    if (covered.length) return covered;
    if (employeePairs.length) return employeePairs;
    return doctorPairs;
  }, [doctorPairs, employeePairs]);

  const hqOptions = useMemo(() => {
    const fromPairs = [...new Set(pairs.map((pair) => pair.hq).filter(Boolean))];
    // Nothing carries an HQ — fall back to the doctor's own territory so the
    // customer list still has something to narrow by.
    const names = fromPairs.length
      ? fromPairs
      : [doctorTerritory || doctorHq].filter(Boolean);

    return names.sort().map((name) => ({ value: name, label: name }));
  }, [pairs, doctorTerritory, doctorHq]);

  /** The departments of the pairs at the chosen HQ. */
  const departmentOptions = useMemo(() => {
    const atHq = pairs.filter((pair) => !pair.hq || !hq || pair.hq === hq);
    const names = [
      ...new Set((atHq.length ? atHq : pairs).map((pair) => pair.department).filter(Boolean)),
    ];

    return names.sort().map((name) => ({ value: name, label: name }));
  }, [pairs, hq]);

  // Default the employee to whoever is signed in, once the list is in.
  const didPrefillEmployee = useRef(false);
  useEffect(() => {
    if (!open) {
      didPrefillEmployee.current = false;
      return;
    }
    if (didPrefillEmployee.current) return;
    if (!myEmployeeId) return;
    if (!employeeOptions.some((option) => option.value === myEmployeeId)) return;

    didPrefillEmployee.current = true;
    form.setValue("employee", myEmployeeId);
  }, [open, myEmployeeId, employeeOptions, form]);

  /**
   * Auto-select whenever there is only one thing to pick, and drop a value the
   * current options no longer contain (changing employee or HQ can invalidate
   * it). One option and one keystroke is the common case: most doctors carry a
   * single HQ and a single department, so the user only touches these when the
   * doctor genuinely spans more than one.
   */
  useEffect(() => {
    if (!open) return;
    const values = hqOptions.map((option) => option.value);
    if (hqOptions.length === 1 && hq !== values[0]) {
      form.setValue("hq", values[0], { shouldDirty: true });
    } else if (hq && values.length && !values.includes(hq)) {
      form.setValue("hq", "", { shouldDirty: true });
    }
  }, [open, hqOptions, hq, form]);

  useEffect(() => {
    if (!open) return;
    const values = departmentOptions.map((option) => option.value);
    if (departmentOptions.length === 1 && department !== values[0]) {
      form.setValue("department", values[0], { shouldDirty: true });
    } else if (department && values.length && !values.includes(department)) {
      form.setValue("department", "", { shouldDirty: true });
    }
  }, [open, departmentOptions, department, form]);

  // Billing runs through the customers of the chosen HQ — the same narrowing the
  // visit POB gets from the visit's own territory.
  useEffect(() => {
    if (!open || !hq) {
      setCustomerOptions([]);
      // Without this the spinner is left running when the HQ is cleared mid
      // fetch, and the picker sits on "loading" with nothing ever arriving.
      setIsLoadingCustomers(false);
      return;
    }

    let cancelled = false;
    setIsLoadingCustomers(true);

    (async () => {
      let rows = [];
      try {
        rows = (await fetchCustomersByTerritory(hq)) ?? [];

        // The server-side territory filter comes back empty for some HQs even
        // where customers exist under them. Rather than show an empty picker
        // and blame the mapping, fall back to the full list — which the visit
        // POB uses anyway — and match on the territory we already read back.
        if (!rows.length) {
          const all = (await fetchAllCustomers()) ?? [];
          rows = all.filter((entry) => entry.territory === hq);
        }
      } catch (error) {
        console.error("Failed to fetch customers for HQ", error);
        rows = [];
      }

      if (cancelled) return;

      setCustomerOptions(
        rows
          .map((entry) => ({
            label: entry.name ?? entry.label ?? entry.value,
            value: entry.name ?? entry.value,
          }))
          .filter((option) => option.value)
      );
      setIsLoadingCustomers(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, hq]);

  // Clear a customer that the new HQ can't bill.
  useEffect(() => {
    if (!customer) return;
    if (isLoadingCustomers) return;
    if (!customerOptions.length) return;
    if (customerOptions.some((option) => option.value === customer)) return;
    form.setValue("customer", "");
  }, [customer, customerOptions, isLoadingCustomers, form]);

  useEffect(() => {
    if (!open || !department) {
      setItemOptions([]);
      return;
    }

    let cancelled = false;
    setIsLoadingItems(true);

    fetchItemsByDepartment([department])
      .then((items) => {
        if (!cancelled) setItemOptions(items ?? []);
      })
      .catch((error) => {
        console.error("Failed to fetch POB items", error);
        if (!cancelled) setItemOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, department]);

  // Rates live on the item master, not on the row.
  useEffect(() => {
    syncPobItemRates(form, pobItems, itemOptions);
  }, [pobItems, itemOptions, form]);

  const total = useMemo(
    () =>
      (pobItems ?? []).reduce(
        (acc, row) => {
          acc.qty += Number(row.qty) || 0;
          acc.amount += Number(row.amount) || 0;
          return acc;
        },
        { qty: 0, amount: 0 }
      ),
    [pobItems]
  );

  const addRow = useCallback(() => {
    form.setValue(
      "fsl_doctor_item",
      [...(form.getValues("fsl_doctor_item") ?? []), { ...EMPTY_ROW }],
      { shouldDirty: true }
    );
  }, [form]);

  const removeRow = useCallback(
    (index) => {
      const rows = [...(form.getValues("fsl_doctor_item") ?? [])];
      rows.splice(index, 1);
      form.setValue("fsl_doctor_item", rows, { shouldDirty: true });
    },
    [form]
  );

  const handleSave = async () => {
    const values = form.getValues();
    const rows = values.fsl_doctor_item ?? [];

    if (linkDoctor && !doctorId) {
      toast.error("This card has no doctor code, so the POB can't be linked to it");
      return;
    }
    if (!values.employee) return toast.error("Select the employee this POB is for");
    if (!values.hq) return toast.error("Select the HQ");
    if (!values.department) return toast.error("Select the department");
    if (!values.customer) return toast.error("Select a customer for this POB");
    if (!values.visitAt) return toast.error("Pick the date and time");
    if (!values.reason?.trim()) return toast.error("Give a reason for raising this POB directly");
    if (!rows.length) return toast.error("Add at least one item");
    if (rows.some((row) => !row.item__name)) return toast.error("Every row needs an item");
    if (rows.some((row) => !(Number(row.qty) > 0))) return toast.error("Every item needs a quantity");

    const when = new Date(values.visitAt);
    if (Number.isNaN(when.getTime())) return toast.error("That date and time isn't valid");

    setIsSaving(true);

    try {
      await ensureErpAuth({ erpUrl, authToken, erpTarget });

      const employeeLabel =
        employeeOptions.find((option) => option.value === values.employee)?.label ??
        values.employee;

      const quotationDoc = buildQuotationDoc({
        customer: values.customer,
        when,
        rows,
        reasonField,
        reasonHtml: buildReasonHtml({
          reason: values.reason.trim(),
          doctorLabel: [doctorName, doctorId].filter(Boolean).join(" · "),
          employeeLabel,
          hq: values.hq,
          department: values.department,
          recordedAt: values.visitAt.replace("T", " "),
        }),
        extraFields: {
          // Off by default: a direct POB is a billing document, and the doctor
          // Link makes ERP validate DR-xxxxx against the Lead table of whatever
          // environment the write lands in — which is what "Could not find
          // DoctorVisit" was. The doctor is named in the reason block either way.
          ...(linkDoctor && doctorId ? { custom_doctorvisit: doctorId } : {}),
          ...(employeeField ? { [employeeField]: values.employee } : {}),
        },
      });

      const saved = await saveDocToQuotation(quotationDoc);

      toast.success(`POB saved — ${saved.name}`);
      onSaved?.({
        quotation: saved.name,
        doctorId,
        doctorName,
        employee: values.employee,
        hq: values.hq,
        department: values.department,
        customer: values.customer,
        visitAt: values.visitAt,
        reason: values.reason.trim(),
        items: rows,
        total,
      });
      onOpenChange?.(false);
    } catch (error) {
      console.error("Failed to save direct POB", error);
      toast.error(error?.message || "Couldn't save the POB");
    } finally {
      setIsSaving(false);
    }
  };

  const lineCount = (pobItems ?? []).filter((row) => row.item__name).length;

  return (
    <Modal open={!!open} onOpenChange={onOpenChange}>
      <ModalContent
        side="bottom"
        className="pob-sheet flex max-h-[94dvh] flex-col gap-0 p-0 lg:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{SHEET_CSS}</style>
        {renderToaster ? <Toaster richColors position="top-center" /> : null}

        {/* HEAD — the doctor is the subject, so they get the size; "Add POB"
            rides above as the eyebrow and stays the accessible name. */}
        <ModalHeader className="shrink-0 space-y-0 border-b border-[var(--line)] px-5 py-4 pr-12 text-left sm:text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-sm font-bold tracking-tight text-[var(--accent)]">
              {initialsOf(doctorName || doctorId)}
            </div>
            <div className="min-w-0">
              <ModalTitle asChild>
                <h2 className="pob-label">Add POB</h2>
              </ModalTitle>
              <p className="truncate text-[17px] font-bold leading-tight tracking-[-0.01em]">
                {doctorName || doctorId || "This doctor"}
              </p>
              <ModalDescription asChild>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {doctorId ? (
                    <span className="pob-num rounded-md bg-[var(--ground)] px-1.5 py-0.5 font-semibold">
                      {doctorId}
                    </span>
                  ) : null}
                  <span className={doctorId ? "ml-2" : undefined}>
                    Billed without a visit
                  </span>
                </p>
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <Form {...form}>
            <div className="space-y-6">
              {bootError ? <Notice tone="rose">{bootError}</Notice> : null}

              <Section title="Who & where" hint={isLoading ? "Loading…" : undefined}>
                <RHFComboboxField
                  name="employee"
                  label="Employee"
                  options={employeeOptions}
                  multiple={false}
                  tagsDisplay={false}
                  loading={isLoading}
                  placeholder="Select employee"
                  searchPlaceholder="Search by name or ID"
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <RHFComboboxField
                    name="hq"
                    label="HQ"
                    options={hqOptions}
                    multiple={false}
                    tagsDisplay={false}
                    loading={isLoading}
                    placeholder="Select HQ"
                    searchPlaceholder="Search HQ"
                  />

                  <RHFComboboxField
                    name="department"
                    label="Department"
                    options={departmentOptions}
                    multiple={false}
                    tagsDisplay={false}
                    loading={isLoading}
                    placeholder="Select department"
                    searchPlaceholder="Search department"
                  />
                </div>

                {!isLoading && hqOptions.length === 0 ? (
                  <Notice>
                    No HQ is mapped to this doctor or this employee, so there is
                    nothing to bill against. Ask MIS to set the Territory on the
                    doctor&apos;s Lead.
                  </Notice>
                ) : null}

                {selectedEmployee && !isLoading && departmentOptions.length === 0 ? (
                  <Notice>
                    No product department is mapped to this doctor or this
                    employee&apos;s role profile, so no items can be listed. Ask
                    MIS to map a department on the doctor&apos;s Lead.
                  </Notice>
                ) : null}
              </Section>

              <Section title="Billing">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <RHFComboboxField
                    name="customer"
                    label="Customer"
                    options={customerOptions}
                    multiple={false}
                    tagsDisplay={false}
                    loading={isLoadingCustomers}
                    placeholder={hq ? "Select customer" : "Pick an HQ first"}
                    searchPlaceholder="Search customer"
                  />

                  <div className="flex flex-col gap-2">
                    <label htmlFor="pob-visit-at">Billed on</label>
                    <Input
                      id="pob-visit-at"
                      type="datetime-local"
                      className="pob-num"
                      value={visitAt}
                      onChange={(e) =>
                        form.setValue("visitAt", e.target.value, { shouldDirty: true })
                      }
                    />
                  </div>
                </div>

                <p className="pob-note">
                  ERP dates the quotation by the day. The exact time is kept with
                  the reason.
                </p>

                {/* An empty dropdown is indistinguishable from a broken search,
                    so name the cause instead of leaving them tapping at it. */}
                {hq && !isLoadingCustomers && customerOptions.length === 0 ? (
                  <Notice>
                    No customer is mapped to {hq}. Pick another HQ, or ask MIS to
                    map the distributor to this territory.
                  </Notice>
                ) : null}
              </Section>

              <Section title="Reason" hint="Required">
                <Textarea
                  rows={3}
                  placeholder="Why this is billed without a visit"
                  value={reason}
                  onChange={(e) =>
                    form.setValue("reason", e.target.value, { shouldDirty: true })
                  }
                />
              </Section>

              <Section title="Items">
                {department && !isLoadingItems && itemOptions.length === 0 ? (
                  <Notice>
                    No billable item is mapped to {department}, so nothing can be
                    listed. Ask MIS to map the products to it.
                  </Notice>
                ) : null}

                {!customer ? (
                  <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--ground)] px-4 py-8 text-center text-xs font-medium text-[var(--muted)]">
                    Choose a customer, then add the items billed.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Column heads sit on the same grid as the rows, so the
                        figures line up down the sheet. */}
                    <div className="pob-line pob-line-head">
                      <span className="pob-line-no" />
                      <span className="pob-line-item pob-label">Item</span>
                      <span className="pob-line-qty pob-label">Qty</span>
                      <span className="pob-line-amt pob-label text-right">Amount</span>
                      <span className="pob-line-del" />
                    </div>

                    <div className="pob-lines space-y-2 sm:space-y-0">
                      {(pobItems ?? []).map((row, index) => (
                        <div key={index} className="pob-line">
                          <span className="pob-line-no pob-label pob-num">
                            <span className="sm:hidden">Line </span>
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="pob-line-item">
                            <RHFComboboxField
                              name={`fsl_doctor_item.${index}.item__name`}
                              options={getAvailableItems(itemOptions, pobItems, row.item__name)}
                              tagsDisplay={false}
                              multiple={false}
                              loading={isLoadingItems}
                              placeholder="Select item"
                              searchPlaceholder="Search item by name or code"
                            />
                          </div>

                          <div className="pob-line-qty">
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-label={`Quantity, line ${index + 1}`}
                              className="pob-num"
                              value={row.qty}
                              onChange={(e) => {
                                // Clearing the field yields NaN, which then fails
                                // on a value the user can't see.
                                const parsed = Number(e.target.value);
                                updatePobRow(form, index, {
                                  qty: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                                });
                              }}
                            />
                          </div>

                          <div className="pob-line-amt pob-line-amount pob-num">
                            {Number(row.amount ?? 0).toFixed(2)}
                          </div>

                          <button
                            type="button"
                            className="pob-line-del flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Remove line ${index + 1}`}
                            onClick={() => removeRow(index)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addRow}
                      className="pob-label flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line)] py-3 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      Add line
                    </button>
                  </div>
                )}
              </Section>
            </div>
          </Form>
        </div>

        {/* FOOT — the docket total, stamped where it can always be read, and
            the only place in the sheet given any weight. */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--line)] bg-white px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-[var(--muted)]">₹</span>
              <span className="pob-num text-[22px] font-bold leading-none tracking-[-0.02em]">
                {total.amount.toFixed(2)}
              </span>
            </div>
            <p className="pob-note pob-num mt-1 truncate">
              {lineCount} {lineCount === 1 ? "line" : "lines"} · {total.qty}{" "}
              {total.qty === 1 ? "unit" : "units"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => onOpenChange?.(false)}
            >
              Cancel
            </Button>
            {/* Deliberately not disabled on an incomplete form: a dead Save
                button explains nothing, while pressing it names the one field
                that is missing. */}
            <Button type="button" disabled={isSaving} onClick={handleSave}>
              {isSaving ? "Saving…" : "Save POB"}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
