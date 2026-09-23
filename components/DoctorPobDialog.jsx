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
import { Calendar } from "@calendar/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import { RHFComboboxField } from "@calendar/components/calendar/form-fields";

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { clearCached, getCached } from "@calendar/lib/data-cache";
import { getAvailableItems, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import { fetchItemsByDepartment } from "@calendar/components/calendar/module/event/services/master-data.service";

// The doctor page's own scoping, not the calendar's. See `loadPobSpan` below
// for why the two cannot share an answer here.
import { erpList, resolveViewer } from "./DoctorDetail/lib/erp";
import {
  coveragePairs,
  descendantsOf,
  fetchAllEmployees,
  fetchEmployeeRow,
  fetchRoleProfiles,
  resolveScope,
} from "./DoctorDetail/lib/scope";
import { ADMIN_MIN_RANK, gradeRank } from "./DoctorDetail/lib/grade";
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
 * WHO may this be logged for is decided by the TOKEN, never by a prop — see
 * `loadPobSpan`. The EMPLOYEE list is the signed-in person's own span: just
 * themselves for a BE, their team for an ABM, every division under them for an
 * RBM / SM / ZSM, and the whole company for Admin / MIS / IT / GM / CEO, who
 * sit outside the reporting tree rather than on top of it. A login we cannot
 * resolve to an Employee gets an EMPTY list and a reason, never a full one.
 *
 * Nothing is offered company-wide. HQ and DEPARTMENT come from the DOCTOR'S own
 * `custom_role_profile` rows — (department, HQ) triples, usually just one, in
 * which case both are auto-selected and the user never touches them; a doctor
 * spanning several leaves the choice open. The CHOSEN employee's own coverage
 * then narrows that set, so changing the employee moves HQ and department
 * together. Customer follows the chosen HQ and items follow the chosen
 * department.
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

const SPAN_CACHE_KEY = "DOCTOR_POB_SPAN";

/** Keyed by identity, because the bound-employee fallback changes the answer. */
const spanCacheKey = (employeeId) => `${SPAN_CACHE_KEY}:${employeeId ?? ""}`;

const SALES_DEPARTMENTS_CACHE_KEY = "POB_SALES_DEPARTMENTS";

/**
 * Every selling division in the company — 28 of them, verified live Sep 2026.
 *
 * ERP models the divisions as Departments parented to the `Sales` group:
 * Elbrit Coimbatore, Vasco Karnataka, CND Trichy, Aura & Proxima Kerala and so
 * on. The group rows and the head-office departments (IT, HR, Accounts) hang
 * off `All Departments` instead, so `parent_department = "Sales"` plus
 * `is_group = 0` is the whole selling roster and nothing else. Note "Sales -
 * ELPL" is NOT in it — that one is parented to `All departments  - ELPL` and is
 * the holding bucket SMs and ZSMs sit in, which is exactly right: it is not a
 * division and must never be billable.
 *
 * Only head office is ever offered this (see `departmentOptions`). Everyone
 * else gets the divisions their own subtree works, so the list is never fetched
 * for a rep at all.
 *
 * `department_name` is the unsuffixed form ("Elbrit Coimbatore") and is what
 * `fetchItemsByDepartment` matches items on, so it is taken in preference to
 * the docname.
 */
async function fetchSalesDepartments() {
  return getCached(SALES_DEPARTMENTS_CACHE_KEY, async () => {
    const rows = await erpList("Department", {
      fields: ["name", "department_name"],
      filters: [
        ["parent_department", "=", "Sales"],
        ["is_group", "=", 0],
        ["disabled", "=", 0],
      ],
      limit: 500,
    });

    return [
      ...new Set(
        rows
          .map((row) => stripCompanySuffix(row?.department_name || row?.name))
          .filter(Boolean)
      ),
    ].sort();
  });
}

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
 * Both sides now carry the Department DOCNAME ("Aura & Proxima Kerala - ELPL")
 * and both are stripped of the company suffix before they get here, but the
 * contains-either-way test is kept rather than tightened to equality: the two
 * are read from different doctypes, and this is the same normalise-and-contain
 * rule `fetchItemsByDepartment` applies internally to decide which items a
 * department may bill, which is module-private there.
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

/**
 * WHO is filling this in, and who they may fill it in FOR.
 *
 * Everything here comes from the TOKEN. The ERP credential the page runs on
 * names a User, the User names an Employee, and that Employee's own position in
 * the reporting tree is the span — the same `resolveViewer` + `resolveScope`
 * pair the doctor detail page reads with, so what a person may WRITE a POB for
 * can never drift from what they may READ about the doctor beside it.
 *
 * ONE SPAN RULE, NO PER-GRADE BRANCH. `resolveScope` walks `Employee.reports_to`
 * downward, and every stated rule falls out of that walk:
 *
 *   BE                      a leaf — the list is just them
 *   ABM                     their BEs, so the HQs THEY hold and no more
 *   RBM                     their ABMs and BEs, so their division
 *   SM / ZSM                every division under them, never the ones they do
 *                           not carry
 *   Admin / MIS / IT /      NOT IN THE TREE. IN002 (seat "Admin") reports to
 *   GM / CEO                E00920 alongside four other IT staff, so walking
 *                           down from them yields a five-name list — which is
 *                           exactly what this popup used to show the people
 *                           meant to see everything. `scope.unlimited` says so
 *                           and the picker becomes every active employee.
 *   unresolved              NOTHING, and a reason on screen. A login with no
 *                           Employee row is the LEAST privileged reader, not
 *                           the most; the old code fell open to the full
 *                           company here, which is the same bug pointing the
 *                           other way.
 *
 * WHY NOT THE CALENDAR'S `resolveVisibleRoleIds`, which this replaced. It walks
 * the Role Profile tree instead of `reports_to`, and it decides "is this person
 * an admin?" by reading `LOGGED_IN_USER.role` — a global that only AuthProvider
 * ever fills in, and AuthProvider is on the calendar page, not this one. On the
 * doctor page that global is null, so the admin branch could not fire; the seat
 * `Admin` is `is_group = 0` in ERP, which made the walk treat a company-wide
 * seat as a leaf and hand it four names. Seats are the wrong key besides:
 * several BEs carry `custom_role_profile` empty, and two people can hold one
 * seat.
 *
 * `fallbackEmployeeId` IS THE BOUND `employee` PROP, AND IT IS ONLY EVER
 * REACHED WHEN THE TOKEN NAMES NOBODY. Two pages mount this popup and they do
 * not authenticate alike: the doctor console hands down the signed-in user's
 * own credential, while a doctor LIST card can be pointed at a shared /tokens
 * row, and a shared credential belongs to an integration account with no
 * Employee record. Failing closed there would leave that card with a dead form
 * and no way to fix it from Studio, so the page is allowed to ASSERT who it is
 * for and the span is walked from that person instead.
 *
 * That is a usability fallback, not a hole. Where the token DOES name an
 * Employee the prop is never consulted for identity at all, so nobody can widen
 * their own picker by editing a Studio field; and where it does not, the shared
 * credential can already write anything ERP allows, so the picker was never the
 * boundary. Bind the user's own token and it stops being reachable.
 *
 * Cached per identity for the session. The token does not change under the
 * page, and a ZSM's walk is five round trips nobody should pay for twice.
 */
async function loadPobSpan(fallbackEmployeeId) {
  return getCached(spanCacheKey(fallbackEmployeeId), async () => {
    const viewer = await resolveViewer();

    let row = viewer?.resolved ? viewer.row : null;
    let identity = row ? "token" : null;

    if (!row && fallbackEmployeeId) {
      row = await fetchEmployeeRow(fallbackEmployeeId);
      if (row) identity = "employee";
    }

    if (!row) return { viewer, identity: null, scope: null, people: [], seats: new Map() };

    const scope = await resolveScope(row);

    // The seats, so the department a POB is filed under comes from the ROLE
    // PROFILE rather than the person — see `coveragePairs`. 440 rows, one read,
    // cached with the rest of the span.
    const seats = await fetchRoleProfiles();

    // Head office has no subtree to offer, so their list is fetched whole.
    // Everyone else already holds their people from the walk above and pays
    // nothing more.
    let people = scope?.unlimited
      ? await fetchAllEmployees()
      : (scope?.people ?? []);

    // A FAILED WALK still leaves the person themselves. `resolveScope` refuses
    // to collapse to "just me" because for READING a doctor that would look
    // like a working page showing a manager a BE's slice. Here it is the
    // opposite trade: a BE's correct answer IS just them, so offering the one
    // name we are sure of unblocks the common case — and the caller keeps the
    // error on screen, so a manager can see their list is short and why.
    if (!scope?.resolved && !people.length) people = [row];

    return { viewer, identity, self: row, scope, people, seats };
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

/**
 * The Employee ID behind whatever Studio bound to `employee`.
 *
 * A HINT, never a scope. It says which row of the list starts selected and is
 * ignored when it names somebody the token cannot log a POB for — the list
 * itself is built from the span, so binding a stranger's id in Studio adds
 * nobody. That is the same rule `resolveScope` states for its own `employee`
 * argument, and it is the reason the viewer's ROLE is not a prop either.
 */
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

/* ORDER LINES — one card per line, identical at every width.

   There used to be two layouts: a card on a phone and, above 640px, a ruled
   table with its own header row driven by a second grid-template. Two layouts
   is two things to keep right, and the table gained nothing — a POB is three or
   four lines, not a spreadsheet.

   An UNPRICED line shows only its item picker. The old row always rendered a
   quantity box and an amount, so a line you had not chosen an item for yet sat
   there showing "1" and "0.00" — two numbers that meant nothing, on the step
   where the user has the least idea what to do.

   Quantity is a STEPPER, not a bare number field. This is filled in at a clinic
   door on a phone, where every quantity is a small number and summoning a
   numeric keyboard to type "2" is the slowest way to say it. The input stays,
   so a bulk line can still be typed and the field remains reachable by
   keyboard and screen reader. */
.pob-sheet .pob-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.25rem;
  gap: 0.625rem 0.75rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
  background: #fff;
}
.pob-sheet .pob-line-item { min-width: 0; }

/* The priced half, once an item is on the line. */
.pob-sheet .pob-line-foot {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.pob-sheet .pob-line-money { text-align: right; line-height: 1.25; }
.pob-sheet .pob-line-total { font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; }

.pob-sheet .pob-step {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 0.625rem;
  background: #fff;
  overflow: hidden;
}
.pob-sheet .pob-step button {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--muted);
  transition: background-color 0.12s, color 0.12s;
}
.pob-sheet .pob-step button:hover:not(:disabled) { background: var(--ground); color: var(--ink); }
.pob-sheet .pob-step button:disabled { opacity: 0.3; }
/* Beats the generic number-input rule above, which is the same specificity
   and would otherwise win on source order alone. */
.pob-sheet .pob-step input[type="number"] {
  width: 3rem;
  height: 2.5rem;
  padding: 0;
  text-align: center;
  font-weight: 600;
  border-width: 0 1px;
  border-radius: 0;
  border-color: var(--line);
}
.pob-sheet .pob-step input[type="number"]::-webkit-outer-spin-button,
.pob-sheet .pob-step input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pob-sheet .pob-step input[type="number"] { -moz-appearance: textfield; appearance: textfield; }

/* VISITED ON — a trigger that matches the comboboxes beside it, and a popover
   that belongs to this sheet rather than to the browser. */
.pob-sheet .pob-when {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: #fff;
  color: var(--ink);
  font-weight: 500;
  text-align: left;
}
.pob-sheet .pob-when:hover { border-color: #c7cedf; }
.pob-sheet .pob-when-day { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pob-sheet .pob-when-time {
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: 0.5rem;
  background: var(--ground);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.pob-when-pop { padding: 0.625rem; }
.pob-when-chips { display: flex; gap: 0.375rem; padding-bottom: 0.5rem; }
.pob-when-chips button {
  flex: 1;
  padding: 0.4375rem 0.5rem;
  border: 1px solid #e5e9f2;
  border-radius: 0.625rem;
  background: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7591;
  transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}
.pob-when-chips button:hover { border-color: #c7cedf; color: #131a2e; }
.pob-when-chips button[data-on] {
  border-color: #4f46e5;
  background: #eef0ff;
  color: #4f46e5;
}
.pob-when-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding-top: 0.625rem;
  border-top: 1px solid #e5e9f2;
}
.pob-when-time-row .pob-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7591; }
.pob-when-time-row input {
  width: 8.5rem;
  height: 2.5rem;
  padding: 0 0.625rem;
  border: 1px solid #e5e9f2;
  border-radius: 0.625rem;
  font-weight: 600;
}
`;

/**
 * VISITED ON — the date, with the time kept quietly beside it.
 *
 * This was a bare `<input type="datetime-local">`, which hands the whole job to
 * the browser. Chrome answers with a two-pane calendar and a pair of scrolling
 * hour/minute columns in its own blue, sized and aligned to nothing else on the
 * sheet — the one control on the form that does not look like the form.
 *
 * The app's own `DateTimePicker` cannot be reused here: it calls `useCalendar`,
 * which THROWS outside a CalendarProvider, and this popup runs on the doctor
 * page where there is none. So it is built from the same two primitives that
 * one is built from — both context-free — and the sheet keeps one voice.
 *
 * THE DATE LEADS AND THE TIME FOLLOWS, because that is what the field means:
 * ERP dates a Quotation by the DAY, and the time survives only in the reason
 * block. Today and Yesterday are chips because a POB raised without a visit is
 * almost always being caught up on the day or the day after.
 *
 * The value stays a `datetime-local` string ("2026-09-21T14:06") rather than a
 * Date, so everything downstream — the save, the reason block — is untouched.
 */
function PobWhen({ value, onChange }) {
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(value) : null;
  const when = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  const setDay = (day) => {
    if (!day) return;
    const next = new Date(day);
    // Carry the time across, so picking a date never silently resets it.
    next.setHours(when ? when.getHours() : 0, when ? when.getMinutes() : 0, 0, 0);
    onChange(toLocalInputValue(next));
    setOpen(false);
  };

  const setTime = (text) => {
    const [h, m] = String(text || "").split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const next = new Date(when ?? new Date());
    next.setHours(h, m, 0, 0);
    onChange(toLocalInputValue(next));
  };

  const isToday = when && when.toDateString() === new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = when && when.toDateString() === yesterday.toDateString();

  const dayLabel = !when
    ? "Pick a date"
    : isToday ? "Today"
    : isYesterday ? "Yesterday"
    : when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const timeLabel = when
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id="pob-visit-at" className="pob-when">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0 text-[var(--muted)]">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" />
          </svg>
          <span className="pob-when-day">{dayLabel}</span>
          {timeLabel ? <span className="pob-when-time pob-num">{timeLabel}</span> : null}
        </button>
      </PopoverTrigger>

      {/* This popover is non-modal, so inside the dialog react-remove-scroll
          cancels any scroll that starts in the portalled content. Stopping the
          events in the capture phase keeps them away from that listener. */}
      <PopoverContent
        align="start"
        className="w-auto p-0"
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
      >
        <div className="pob-when-pop">
          <div className="pob-when-chips">
            <button type="button" data-on={isToday ? "" : undefined} onClick={() => setDay(new Date())}>
              Today
            </button>
            <button type="button" data-on={isYesterday ? "" : undefined} onClick={() => setDay(yesterday)}>
              Yesterday
            </button>
          </div>

          {/* v9 renamed `initialFocus` to `autoFocus`; the old name is silently ignored. */}
          <Calendar mode="single" selected={when ?? undefined} onSelect={setDay} autoFocus />

          <label className="pob-when-time-row">
            <span className="pob-label">Time</span>
            <Input
              type="time"
              className="pob-num"
              value={when ? toLocalInputValue(when).slice(11, 16) : ""}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  const [span, setSpan] = useState(null);
  const [fetchedRoles, setFetchedRoles] = useState([]);
  const [doctorTerritory, setDoctorTerritory] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [salesDepartments, setSalesDepartments] = useState([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
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
    setSalesDepartments([]);
    setFetchedRoles([]);
    setDoctorTerritory(null);
    setBootError(null);
    // form is a stable RHF instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * The Employee id the page bound, as a STRING.
   *
   * Memoised because Studio can hand `employee` down as a fresh object on every
   * render, and the boot effect below depends on this — on the prop itself it
   * would re-walk the hierarchy on each render for as long as the popup is open.
   */
  const boundEmployeeId = useMemo(() => resolveEmployeeId(employee), [employee]);

  // Who is filling this in and who they may fill it in for. Cached module-side,
  // so reopening the popup is instant and only the first open pays for the walk.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        await ensureErpAuth({ erpUrl, authToken, erpTarget });

        const loaded = await loadPobSpan(boundEmployeeId);

        // A degraded answer must not be cached for the rest of the session:
        // reopening the popup should retry the walk, not repeat a transient
        // ERP failure until the tab is reloaded.
        if (!loaded.identity || !loaded.scope?.resolved) {
          clearCached([spanCacheKey(boundEmployeeId)]);
        }

        if (cancelled) return;
        setSpan(loaded);

        // Both of these leave the employee picker empty, and an empty picker is
        // indistinguishable from a broken one — so each says which it is. They
        // are NOT widened into a full list: a POB logged against the wrong
        // person is a real billing document in somebody else's numbers.
        if (!loaded.identity) {
          setBootError(
            "Your ERP login isn't linked to an Employee record, so there is "
            + "nobody this POB could be logged for. Ask HR to set User ID on "
            + "your Employee row."
          );
        } else if (!loaded.scope?.resolved) {
          // `resolveScope` swallows a failed walk and returns unresolved rather
          // than collapsing to "just me" — which would look like a working form
          // quietly offering a manager only themselves.
          setBootError(
            "Couldn't read your reporting line from ERP, so this list shows "
            + "only you. If you have a team, close this and reopen it before "
            + "logging anything for them."
          );
        } else if (!loaded.people.length) {
          setBootError(
            "ERP has no reporting line for you, so there is nobody to log this "
            + "POB for. Ask HR to set Reports To on the Employee records under "
            + "you."
          );
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to work out who this POB may be logged for", error);
        setBootError(
          error?.message || "Couldn't work out who this POB may be logged for"
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, boundEmployeeId, erpUrl, authToken, erpTarget]);

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

  /**
   * Everyone the token says this POB may be logged for. Fails CLOSED.
   *
   * `resolveScope` walks `reports_to` without asking about status, because for
   * READING a doctor a Left employee's rows still count — they are stamped with
   * a seat somebody else holds now. Writing is the other way round: a POB
   * logged for somebody who has left is a billing document against nobody. The
   * viewer's own row arrives from `resolveViewer`, which does not select
   * `status` at all, so a missing one reads as active rather than dropping the
   * person filling the form in.
   *
   * Vacant seats (`V…` ids) ARE active and are deliberately kept — ERP writes
   * real rows against them, and they are exactly the chair a POB may need to
   * land on while a replacement is being hired.
   */
  const spanPeople = useMemo(
    () => (span?.people ?? []).filter((row) => !row?.status || row.status === "Active"),
    [span]
  );

  /**
   * Who this POB may be logged for.
   *
   * Empty when the viewer could not be resolved, and that is the point: the
   * previous build fell back to every active employee whenever it could not
   * work out who was reading, which on this page was ALWAYS — `LOGGED_IN_USER`
   * is filled in by AuthProvider, and AuthProvider is on the calendar. The boot
   * effect puts the reason on screen instead.
   */
  const employeeOptions = useMemo(
    () =>
      spanPeople
        .map((row) => ({
          value: row.name,
          label: row.employee_name ? `${row.employee_name} (${row.name})` : row.name,
          role: row.designation ?? null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [spanPeople]
  );

  /**
   * The default selection: whoever the page bound, else the signed-in employee.
   *
   * The bound id has to survive `employeeOptions` to be used, so it can only
   * ever pick a different row of a list the token already earned.
   */
  const defaultEmployeeId = useMemo(() => {
    if (boundEmployeeId && spanPeople.some((row) => row.name === boundEmployeeId)) {
      return boundEmployeeId;
    }

    const selfId = span?.self?.name ?? null;
    if (selfId && spanPeople.some((row) => row.name === selfId)) return selfId;

    return null;
  }, [boundEmployeeId, span, spanPeople]);

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
   * The (HQ, department) pairs the CHOSEN employee covers — their own subtree,
   * read straight off the Employee rows already in hand.
   *
   * PAIRS, never an HQ list crossed with a department list: a manager's people
   * sit in different HQs carrying different departments, and crossing the two
   * invents combinations nobody works — which is how HQ-Kottayam once ended up
   * beside Aura & Proxima Madurai. A manager's own row contributes nothing
   * ("Sales - ELPL" is a holding bucket, dropped in `coveragePairs`); their
   * real divisions arrive from the BEs beneath them, who are in the same rows.
   *
   * A HEAD-OFFICE seat returns nothing, deliberately. Admin, MIS and IT carry a
   * real department of their own — IN002 is "IT - ELPL" out of HQ-Chennai — and
   * offering IT as the division to bill a doctor under is worse than offering
   * nothing at all. Empty here means `pairs` below falls through to the
   * DOCTOR'S own divisions, which is the right answer for somebody who covers
   * every division equally.
   */
  /**
   * Is the CHOSEN employee head office — Admin, MIS, IT, GM, CEO?
   *
   * Read off their own ERP row (seat prefix, else HR designation), never off a
   * prop. It decides two things below: that they contribute no coverage pairs
   * of their own, and that their department picker is the whole selling roster.
   */
  const selectedIsHeadOffice = useMemo(() => {
    if (!selectedEmployee) return false;
    const self = spanPeople.find((row) => row.name === selectedEmployee);
    if (!self) return false;

    return (
      gradeRank({
        roleId: self.custom_role_profile ?? self.role_id,
        designation: self.designation,
      }) >= ADMIN_MIN_RANK
    );
  }, [spanPeople, selectedEmployee]);

  const employeePairs = useMemo(() => {
    if (!selectedEmployee || selectedIsHeadOffice) return [];
    return coveragePairs(descendantsOf(spanPeople, selectedEmployee), span?.seats);
  }, [spanPeople, selectedEmployee, selectedIsHeadOffice, span]);

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

  /**
   * The divisions this doctor is actually mapped to, at the chosen HQ.
   *
   * Kept separate from `departmentOptions` because it is what gets AUTO-FILLED
   * — head office's list is much longer than this, and the extra entries are an
   * escape hatch, not a reason to make them pick by hand in the normal case.
   */
  const ownDepartments = useMemo(() => {
    const atHq = pairs.filter((pair) => !pair.hq || !hq || pair.hq === hq);
    return [
      ...new Set((atHq.length ? atHq : pairs).map((pair) => pair.department).filter(Boolean)),
    ].sort();
  }, [pairs, hq]);

  /**
   * What the department picker offers.
   *
   * A REP gets the divisions this doctor is mapped to and nothing else — they
   * cannot bill a doctor under a division they do not work, and the intersection
   * with their own coverage is the point of the pair model.
   *
   * HEAD OFFICE GETS ALL 28 SELLING DIVISIONS. Admin, MIS and IT cover every
   * division equally, and `Lead.custom_role_profile` is not a reliable floor to
   * hold them to: a great many doctor Leads were bulk-imported with that child
   * table thin or empty, so restricting head office to it means the one group
   * able to correct a mapping gap is the group blocked by it. The doctor's own
   * divisions still sort FIRST and say so on the label, so the normal answer is
   * still the first thing under the cursor and picking another is a deliberate
   * act, recorded in the reason block like everything else.
   */
  const departmentOptions = useMemo(() => {
    const own = ownDepartments.map((name) => ({
      value: name,
      label: selectedIsHeadOffice && salesDepartments.length
        ? `${name} · on this doctor`
        : name,
    }));

    if (!selectedIsHeadOffice || !salesDepartments.length) return own;

    const covered = new Set(ownDepartments.map((name) => name.toLowerCase()));
    const rest = salesDepartments
      .filter((name) => !covered.has(name.toLowerCase()))
      .map((name) => ({ value: name, label: name }));

    return [...own, ...rest];
  }, [ownDepartments, selectedIsHeadOffice, salesDepartments]);

  // Default the employee to whoever is signed in, once the list is in. Only
  // once per open, so it never fights a choice the user has already made.
  const didPrefillEmployee = useRef(false);
  useEffect(() => {
    if (!open) {
      didPrefillEmployee.current = false;
      return;
    }
    if (didPrefillEmployee.current) return;
    if (!defaultEmployeeId) return;

    didPrefillEmployee.current = true;
    form.setValue("employee", defaultEmployeeId);
  }, [open, defaultEmployeeId, form]);

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

  /*
   * Department auto-fill only ever touches an EMPTY field.
   *
   * The old rule re-asserted the single option whenever the value differed from
   * it, which was harmless while the list WAS that one option. Now that head
   * office sees all 28, the same rule would snap their choice straight back to
   * the doctor's division and make the escape hatch unusable. So: fill when
   * blank, clear when the current value is no longer on offer, and otherwise
   * leave the user's choice alone.
   */
  useEffect(() => {
    if (!open) return;
    const values = departmentOptions.map((option) => option.value);

    if (!department) {
      // The doctor's own division wins even where 27 others are listed.
      const fill =
        ownDepartments.length === 1
          ? ownDepartments[0]
          : values.length === 1
            ? values[0]
            : null;
      if (fill) form.setValue("department", fill, { shouldDirty: true });
      return;
    }

    if (values.length && !values.includes(department)) {
      form.setValue("department", "", { shouldDirty: true });
    }
  }, [open, departmentOptions, ownDepartments, department, form]);

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

  /*
   * The full selling roster, fetched the moment head office is the chosen
   * employee and not a second before — a rep never needs it, and it is one
   * small REST read shared by every doctor for the rest of the session.
   */
  useEffect(() => {
    if (!open || !selectedIsHeadOffice || salesDepartments.length) return;

    let cancelled = false;
    setIsLoadingDepartments(true);

    fetchSalesDepartments()
      .then((names) => {
        if (!cancelled) setSalesDepartments(names ?? []);
      })
      .catch((error) => {
        // Non-fatal: the picker falls back to the doctor's own divisions, which
        // is what a rep gets and is still the right answer most of the time.
        console.error("Failed to load the sales divisions", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDepartments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedIsHeadOffice, salesDepartments.length]);

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
    // Defence in depth. The picker is already built from the span, so this can
    // only fire on a stale selection — but a POB is a real billing document in
    // somebody's numbers, and it must not land against a person this login was
    // never entitled to log one for.
    if (!employeeOptions.some((option) => option.value === values.employee)) {
      return toast.error("You can't log a POB for that employee");
    }
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
                    POB without visit
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
                    loading={isLoading || isLoadingDepartments}
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

                {/* Head office may bill a doctor under a division ERP has not
                    mapped to them — often because the Lead was imported with a
                    thin coverage table. Saying so keeps it a deliberate act
                    rather than a silent one. */}
                {department && ownDepartments.length > 0 && !ownDepartments.includes(department) ? (
                  <Notice>
                    {department} isn&apos;t one of the divisions mapped to this
                    doctor. The POB will still be saved under it, and the reason
                    block records the choice.
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
                    <label htmlFor="pob-visit-at">Visited on</label>
                    <PobWhen
                      value={visitAt}
                      onChange={(next) =>
                        form.setValue("visitAt", next, { shouldDirty: true })
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
                  placeholder="Why this POB has no visit"
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
                    <div className="pob-lines space-y-2">
                      {(pobItems ?? []).map((row, index) => {
                        const qty = Number(row.qty) || 1;
                        const rate = Number(row.rate) || 0;
                        const setQty = (next) =>
                          updatePobRow(form, index, { qty: Math.max(1, next) });

                        return (
                          <div key={index} className="pob-line">
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

                            <button
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove line ${index + 1}`}
                              onClick={() => removeRow(index)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                              </svg>
                            </button>

                            {/* Nothing is priced until an item is on the line,
                                so until then there is nothing to show. */}
                            {row.item__name ? (
                              <div className="pob-line-foot">
                                <div className="pob-step">
                                  <button
                                    type="button"
                                    onClick={() => setQty(qty - 1)}
                                    disabled={qty <= 1}
                                    aria-label={`One fewer, line ${index + 1}`}
                                  >
                                    &#8722;
                                  </button>
                                  <Input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    aria-label={`Quantity, line ${index + 1}`}
                                    className="pob-num"
                                    value={row.qty}
                                    onChange={(e) => {
                                      // Clearing the field yields NaN, which would
                                      // then fail on a value the user cannot see.
                                      const parsed = Number(e.target.value);
                                      setQty(Number.isFinite(parsed) ? parsed : 1);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setQty(qty + 1)}
                                    aria-label={`One more, line ${index + 1}`}
                                  >
                                    +
                                  </button>
                                </div>

                                {/* The unit price sits under the total because
                                    without it the total is a number the user has
                                    no way to check. */}
                                <div className="pob-line-money">
                                  <div className="pob-num pob-line-total">
                                    ₹{Number(row.amount ?? 0).toFixed(2)}
                                  </div>
                                  <div className="pob-note pob-num">
                                    ₹{rate.toFixed(2)} each
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
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
