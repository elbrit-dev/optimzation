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
  fetchCustomersByTerritory,
  saveDocToQuotation,
} from "@calendar/components/calendar/module/event/services/event.service";
import { mapDoctorVisitToQuotation } from "@calendar/components/calendar/module/event/mappers/quotation-to-erp";

import { getEndpointAndAuth } from "@/app/datatable/utils/queryEndpointUtils";

/**
 * DoctorPobDialog — raise a POB straight from the doctor page, with no visit.
 *
 * The normal POB is captured on a doctor visit, where the employee, the HQ and
 * the product department are all already known from the event. Here there is no
 * event, so the popup asks for them in that order (employee -> HQ -> department
 * -> customer -> date/time), then takes the items exactly as the visit editor
 * does. It writes ONE document: the same POB Quotation the visit flow writes,
 * minus the `custom_event` link — nothing is added to the calendar.
 *
 * Every dropdown is scoped to the person, not to the whole company: the employee
 * list is their role subtree, the HQ list is the HQs that subtree actually
 * covers, and the department list is the ones their role profile carries. Picking
 * a different employee re-scopes HQ and department under them.
 *
 * Because such a quotation is otherwise indistinguishable from a visit POB whose
 * event was deleted, a REASON is mandatory and is stored, together with the
 * chosen employee / HQ / department / timestamp, in the Quotation's free-text
 * field (`terms` by default — see `reasonField`), prefixed with DIRECT_POB_MARKER
 * so these can be told apart and reported on.
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
 * Point the calendar's ERP client at an endpoint.
 *
 * On the calendar page AuthProvider has already done this and we must not
 * disturb it. On the doctor page nothing has, so fall back to the same global
 * token rows the page's own data provider runs on.
 */
async function ensureErpAuth({ erpUrl, authToken }) {
  const explicitToken = stripAuthScheme(authToken);
  if (erpUrl && explicitToken) {
    AUTH_CONFIG.erpUrl = String(erpUrl).trim();
    AUTH_CONFIG.authToken = explicitToken;
    return;
  }

  if (AUTH_CONFIG.erpUrl && AUTH_CONFIG.authToken) return;

  const config = await getEndpointAndAuth(null);
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
 * dropped; it is written out in full here. The employee is recorded here too —
 * Quotation has no employee field, and the document's `owner` is whichever
 * account the page's token belongs to, not the person the POB is for.
 */
function buildReasonHtml({ reason, employeeLabel, hq, department, recordedAt }) {
  const lines = [
    DIRECT_POB_MARKER,
    `Employee: ${employeeLabel || "—"}`,
    `HQ: ${hq || "—"}`,
    `Department: ${department || "—"}`,
    `Recorded at: ${recordedAt || "—"}`,
    `Reason: ${reason}`,
  ];

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

/* =====================================================
   LAYOUT BITS
===================================================== */

function Section({ title, hint, children, first = false }) {
  return (
    <section className={first ? "space-y-3" : "space-y-3 border-t border-gray-100 pt-4"}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          {title}
        </h3>
        {hint ? <span className="text-[11px] text-gray-400">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Notice({ tone = "amber", children }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <p className={`rounded-lg border px-3 py-2 text-xs ${tones[tone]}`}>{children}</p>
  );
}

export default function DoctorPobDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  doctorHq,
  employee,
  erpUrl,
  authToken,
  reasonField = "terms",
  employeeField = "",
  renderToaster = true,
  onSaved,
}) {
  const [bootError, setBootError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [employeeNodes, setEmployeeNodes] = useState([]);
  const [roleEdges, setRoleEdges] = useState([]);
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
        await ensureErpAuth({ erpUrl, authToken });

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
  }, [open, erpUrl, authToken]);

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

  /**
   * HQs the CHOSEN employee covers: their own, plus their team's when they
   * manage one. A BE therefore gets exactly one HQ and cannot bill outside it.
   */
  const hqOptions = useMemo(() => {
    const scoped = employeesUnderRole(selectedRoleId);
    if (!scoped) return [];

    const seen = new Set();
    scoped.forEach((node) => {
      const territory = employeeHqMap[node.name];
      if (territory) seen.add(territory);
    });

    return [...seen].sort().map((name) => ({ value: name, label: name }));
  }, [employeesUnderRole, selectedRoleId, employeeHqMap]);

  /** Departments that employee's role profile can bill — same rule as the visit POB. */
  const departmentOptions = useMemo(() => {
    if (!selectedRoleId) return [];
    return resolvePobDepartments(roleEdges, selectedRoleId)
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [roleEdges, selectedRoleId]);

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
   * HQ and department follow the chosen employee. The doctor's own HQ wins when
   * that employee actually covers it — this POB is for this doctor — otherwise
   * fall back to the employee's own HQ, and to nothing when they cover several
   * and no single one is implied.
   */
  const lastScopedEmployee = useRef(null);
  useEffect(() => {
    if (!selectedEmployee || !roleEdges.length) return;
    if (lastScopedEmployee.current === selectedEmployee) return;

    lastScopedEmployee.current = selectedEmployee;

    const allowedHqs = hqOptions.map((option) => option.value);
    const ownHq = employeeHqMap[selectedEmployee] ?? null;
    const nextHq =
      (doctorHq && allowedHqs.includes(doctorHq) && doctorHq) ||
      (ownHq && allowedHqs.includes(ownHq) && ownHq) ||
      (allowedHqs.length === 1 ? allowedHqs[0] : "");

    form.setValue("hq", nextHq, { shouldDirty: true });
    // One department is the common case (a BE carries exactly one); a manager
    // covering several has to say which one this POB bills against.
    const allowedDepartments = resolvePobDepartments(roleEdges, selectedRoleId);
    form.setValue(
      "department",
      allowedDepartments.length === 1 ? allowedDepartments[0] : "",
      { shouldDirty: true }
    );
    form.setValue("customer", "");
  }, [
    selectedEmployee,
    selectedRoleId,
    roleEdges,
    hqOptions,
    employeeHqMap,
    doctorHq,
    form,
  ]);

  // Billing runs through the customers of the chosen HQ — the same narrowing the
  // visit POB gets from the visit's own territory.
  useEffect(() => {
    if (!open || !hq) {
      setCustomerOptions([]);
      return;
    }

    let cancelled = false;
    setIsLoadingCustomers(true);

    fetchCustomersByTerritory(hq)
      .then((customers) => {
        if (cancelled) return;
        setCustomerOptions(
          (customers ?? []).map((entry) => ({
            label: entry.name ?? entry.label ?? entry.value,
            value: entry.name ?? entry.value,
          }))
        );
      })
      .catch((error) => {
        console.error("Failed to fetch customers for HQ", error);
        if (!cancelled) setCustomerOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCustomers(false);
      });

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

    if (!doctorId) {
      toast.error("This card has no doctor code, so the POB can't be linked");
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
      await ensureErpAuth({ erpUrl, authToken });

      const employeeLabel =
        employeeOptions.find((option) => option.value === values.employee)?.label ??
        values.employee;

      // The visit mapper with no event name: same document, no calendar link.
      const quotationDoc = {
        ...mapDoctorVisitToQuotation({
          values: {
            customer: values.customer,
            startDate: when,
            endDate: when,
            fsl_doctor_item: rows,
          },
          doctorId,
          existingName: null,
          eventName: null,
        }),
        [reasonField]: buildReasonHtml({
          reason: values.reason.trim(),
          employeeLabel,
          hq: values.hq,
          department: values.department,
          recordedAt: values.visitAt.replace("T", " "),
        }),
        ...(employeeField ? { [employeeField]: values.employee } : {}),
      };

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

  return (
    <Modal open={!!open} onOpenChange={onOpenChange}>
      <ModalContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 p-0 lg:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {renderToaster ? <Toaster richColors position="top-center" /> : null}

        {/* HEADER — who this POB is for, kept in view while the body scrolls. */}
        <ModalHeader className="shrink-0 space-y-0 border-b border-gray-100 px-4 py-3 pr-12 text-left sm:text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {initialsOf(doctorName || doctorId)}
            </div>
            <div className="min-w-0">
              <ModalTitle className="text-base font-bold text-[#1e2a5a]">
                Add POB
              </ModalTitle>
              <ModalDescription className="truncate text-xs">
                {doctorName || doctorId ? (
                  <>
                    {doctorName || doctorId}
                    {doctorName && doctorId ? (
                      <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">
                        {doctorId}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "Billed against this doctor"
                )}
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {bootError ? <Notice tone="rose">{bootError}</Notice> : null}

          <Form {...form}>
            <div className="space-y-4">
              <Section
                first
                title="Who & where"
                hint={isLoading ? "Loading…" : undefined}
              >
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
                    placeholder={selectedEmployee ? "Select HQ" : "Pick an employee first"}
                    searchPlaceholder="Search HQ"
                  />

                  <RHFComboboxField
                    name="department"
                    label="Department"
                    options={departmentOptions}
                    multiple={false}
                    tagsDisplay={false}
                    loading={isLoading}
                    placeholder={
                      selectedEmployee ? "Select department" : "Pick an employee first"
                    }
                    searchPlaceholder="Search department"
                  />
                </div>

                {selectedEmployee && !isLoading && hqOptions.length === 0 ? (
                  <Notice>
                    No HQ is mapped to this employee or their team, so there is
                    nothing to bill against. Ask MIS to set the Territory on their
                    Employee record.
                  </Notice>
                ) : null}

                {selectedEmployee && !isLoading && departmentOptions.length === 0 ? (
                  <Notice>
                    No product department is mapped to this employee&apos;s role
                    profile, so no items can be listed. Ask MIS to map a department
                    to it.
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

                  <div className="flex flex-col">
                    <label
                      htmlFor="pob-visit-at"
                      className="mb-2 text-sm font-medium leading-none"
                    >
                      Date &amp; time
                    </label>
                    <Input
                      id="pob-visit-at"
                      type="datetime-local"
                      value={visitAt}
                      onChange={(e) =>
                        form.setValue("visitAt", e.target.value, { shouldDirty: true })
                      }
                    />
                  </div>
                </div>

                <p className="text-[11px] text-gray-400">
                  ERP dates the quotation by the day — the exact time is kept with
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
                  placeholder="Why is this POB being raised from the doctor page instead of a visit?"
                  value={reason}
                  onChange={(e) =>
                    form.setValue("reason", e.target.value, { shouldDirty: true })
                  }
                />
              </Section>

              <Section
                title="Items"
                hint={total.qty > 0 ? `${total.qty} qty · ₹${total.amount.toFixed(2)}` : undefined}
              >
                {department &&
                !isLoadingItems &&
                itemOptions.length === 0 ? (
                  <Notice>
                    No billable item is mapped to the selected department, so no
                    items can be listed. Ask MIS to map the products to it.
                  </Notice>
                ) : null}

                {!customer ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                    Pick a customer to start adding items.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-[1fr_84px_104px_36px]">
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Amount</span>
                      <span />
                    </div>

                    {(pobItems ?? []).map((row, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 sm:grid-cols-[1fr_84px_104px_36px] sm:items-center sm:gap-3 sm:rounded-lg sm:bg-transparent sm:p-1"
                      >
                        <div className="min-w-0">
                          <span className="mb-1 block text-[11px] font-medium text-gray-400 sm:hidden">
                            Item
                          </span>
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

                        <div className="flex items-end gap-2 sm:contents">
                          <div className="w-20 sm:w-auto">
                            <span className="mb-1 block text-[11px] font-medium text-gray-400 sm:hidden">
                              Qty
                            </span>
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
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

                          <div className="min-w-0 flex-1 sm:w-auto sm:flex-none">
                            <span className="mb-1 block text-[11px] font-medium text-gray-400 sm:hidden">
                              Amount
                            </span>
                            <Input
                              value={Number(row.amount ?? 0).toFixed(2)}
                              disabled
                              className="text-right font-medium"
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-gray-400 hover:text-rose-600"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => removeRow(index)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" onClick={addRow}>
                        + Add item
                      </Button>

                      {total.qty > 0 ? (
                        <p className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
                          {total.qty} qty · ₹{total.amount.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </Section>
            </div>
          </Form>
        </div>

        {/* FOOTER — outside the scroll area, so Save is always one tap away. */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-white px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSaving}
            onClick={() => onOpenChange?.(false)}
          >
            Cancel
          </Button>
          {/* Deliberately not disabled on an incomplete form: a dead Save
              button explains nothing, while pressing it names the one field
              that is missing. */}
          <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving…" : "Save POB"}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
