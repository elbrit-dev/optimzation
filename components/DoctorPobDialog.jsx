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
  fetchHQTerritories,
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
function buildReasonHtml({ reason, employeeLabel, hq, departments, recordedAt }) {
  const lines = [
    DIRECT_POB_MARKER,
    `Employee: ${employeeLabel || "—"}`,
    `HQ: ${hq || "—"}`,
    `Department: ${(departments ?? []).join(", ") || "—"}`,
    `Recorded at: ${recordedAt || "—"}`,
    `Reason: ${reason}`,
  ];

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
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
  const [hqOptions, setHqOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const form = useForm({
    mode: "onChange",
    defaultValues: {
      employee: "",
      hq: "",
      departments: [],
      customer: "",
      visitAt: "",
      reason: "",
      fsl_doctor_item: [],
    },
  });

  const selectedEmployee = form.watch("employee");
  const hq = form.watch("hq");
  const departments = form.watch("departments");
  const customer = form.watch("customer");
  const pobItems = form.watch("fsl_doctor_item");

  // Reset to a clean sheet on every open — a half-filled POB left over from the
  // previous doctor is worse than no prefill at all.
  useEffect(() => {
    if (!open) return;

    form.reset({
      employee: "",
      hq: doctorHq ?? "",
      departments: [],
      customer: "",
      visitAt: toLocalInputValue(new Date()),
      reason: "",
      fsl_doctor_item: [{ ...EMPTY_ROW }],
    });
    setCustomerOptions([]);
    setItemOptions([]);
    setBootError(null);
    // form is a stable RHF instance; doctorHq is the only real input here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctorHq]);

  // Employees + role hierarchy. Both are cached module-side, so reopening the
  // popup is instant and only the first open pays for them.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        await ensureErpAuth({ erpUrl, authToken });
        const [employees, edges, territories] = await Promise.all([
          fetchEmployeeNodes(),
          fetchElbritRoleEdges(),
          fetchHQTerritories(),
        ]);
        if (cancelled) return;
        setEmployeeNodes(employees);
        setRoleEdges(edges);
        setHqOptions(territories);
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

  const myRoleId = useMemo(() => {
    if (!myEmployeeId) return null;
    const match = employeeNodes.find((node) => node.name === myEmployeeId);
    return match?.role_id ?? LOGGED_IN_USER?.roleId ?? null;
  }, [employeeNodes, myEmployeeId]);

  /**
   * Who this POB may be logged for: the signed-in employee and everyone under
   * them. With no identity to walk down from (the page never bound one) the
   * list stays open rather than empty — an empty picker would block the form
   * outright, and ERP still permission-checks the write.
   */
  const employeeOptions = useMemo(() => {
    const visibleRoleIds = myRoleId ? new Set(resolveVisibleRoleIds(roleEdges, myRoleId)) : null;

    return employeeNodes
      .filter((node) => !visibleRoleIds || visibleRoleIds.size === 0 || visibleRoleIds.has(node.role_id))
      .map((node) => ({
        value: node.name,
        label: node.employee_name
          ? `${node.employee_name} (${node.name})`
          : node.name,
      }));
  }, [employeeNodes, roleEdges, myRoleId]);

  // Every department in the hierarchy, so a manager can bill against any team
  // they cover even when the auto-resolved set is narrower than they need.
  const departmentOptions = useMemo(() => {
    const seen = new Set();
    roleEdges.forEach(({ node }) => {
      if (node?.sales_team__name) seen.add(node.sales_team__name);
    });
    return [...seen].sort().map((name) => ({ value: name, label: name }));
  }, [roleEdges]);

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
   * Departments follow the chosen employee's role profile — the same resolution
   * the visit POB uses — and stay editable afterwards.
   */
  const lastAutoEmployee = useRef(null);
  useEffect(() => {
    if (!selectedEmployee) return;
    if (lastAutoEmployee.current === selectedEmployee) return;
    if (!roleEdges.length) return;

    lastAutoEmployee.current = selectedEmployee;

    const node = employeeNodes.find((entry) => entry.name === selectedEmployee);
    const resolved = resolvePobDepartments(roleEdges, node?.role_id);
    form.setValue("departments", resolved, { shouldDirty: true });
  }, [selectedEmployee, employeeNodes, roleEdges, form]);

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

  const departmentKey = useMemo(
    () => [...(departments ?? [])].sort().join("|"),
    [departments]
  );

  useEffect(() => {
    if (!open || !departmentKey) {
      setItemOptions([]);
      return;
    }

    let cancelled = false;
    setIsLoadingItems(true);

    fetchItemsByDepartment(departmentKey.split("|"))
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
  }, [open, departmentKey]);

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
    form.setValue("fsl_doctor_item", [...(form.getValues("fsl_doctor_item") ?? []), { ...EMPTY_ROW }], {
      shouldDirty: true,
    });
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
    if (!(values.departments ?? []).length) return toast.error("Select at least one department");
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
          departments: values.departments,
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
        departments: values.departments,
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
        className="max-h-[92dvh] lg:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {renderToaster ? <Toaster richColors position="top-center" /> : null}

        <ModalHeader>
          <ModalTitle>Add POB</ModalTitle>
          <ModalDescription>
            {doctorName || doctorId
              ? `Billed against ${doctorName || doctorId}${
                  doctorName && doctorId ? ` · ${doctorId}` : ""
                }`
              : "Billed against this doctor"}
          </ModalDescription>
        </ModalHeader>

        {bootError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {bootError}
          </p>
        ) : null}

        <Form {...form}>
          <div className="space-y-3 pb-2">
            <RHFComboboxField
              name="employee"
              label="Employee"
              options={employeeOptions}
              multiple={false}
              loading={isLoading}
              placeholder="Select Employee"
              searchPlaceholder="Search employee by name or ID"
            />

            <RHFComboboxField
              name="hq"
              label="HQ"
              options={hqOptions}
              multiple={false}
              loading={isLoading}
              placeholder="Select HQ"
              searchPlaceholder="Search HQ"
            />

            <RHFComboboxField
              name="departments"
              label="Department"
              options={departmentOptions}
              multiple
              loading={isLoading}
              placeholder="Select Department"
              searchPlaceholder="Search department"
            />

            <RHFComboboxField
              name="customer"
              label="Customer"
              options={customerOptions}
              multiple={false}
              loading={isLoadingCustomers}
              placeholder={hq ? "Select Customer" : "Pick an HQ first"}
              searchPlaceholder="Search customer"
            />

            {/* An empty dropdown is indistinguishable from a broken search, so
                name the cause instead of leaving them tapping at it. */}
            {hq && !isLoadingCustomers && customerOptions.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No customer is mapped to {hq}. Pick another HQ, or ask MIS to map
                the distributor to this territory.
              </p>
            ) : null}

            <div>
              <p className="mb-1 text-sm font-medium">Date &amp; time</p>
              <Input
                type="datetime-local"
                value={form.watch("visitAt")}
                onChange={(e) =>
                  form.setValue("visitAt", e.target.value, { shouldDirty: true })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                ERP dates the quotation by the day; the exact time is kept with the
                reason below.
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">
                Reason <span className="text-rose-600">*</span>
              </p>
              <Textarea
                rows={3}
                placeholder="Why is this POB being raised from the doctor page instead of a visit?"
                value={form.watch("reason")}
                onChange={(e) =>
                  form.setValue("reason", e.target.value, { shouldDirty: true })
                }
              />
            </div>

            {(departments ?? []).length && !isLoadingItems && itemOptions.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No billable item is mapped to the selected department, so no items
                can be listed. Ask MIS to map the products to it.
              </p>
            ) : null}

            {customer ? (
              <div className="space-y-2">
                <div className="hidden gap-3 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_80px_100px_36px]">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Amount</span>
                  <span />
                </div>

                {(pobItems ?? []).map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_80px_100px_36px] sm:items-end sm:gap-3 sm:rounded-none sm:border-0 sm:p-0"
                  >
                    <div className="min-w-0">
                      <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
                        Item
                      </span>
                      <RHFComboboxField
                        name={`fsl_doctor_item.${index}.item__name`}
                        options={getAvailableItems(itemOptions, pobItems, row.item__name)}
                        tagsDisplay={false}
                        multiple={false}
                        loading={isLoadingItems}
                        placeholder="Select Item"
                        searchPlaceholder="Search item by name or code"
                      />
                    </div>

                    <div className="flex items-end gap-2 sm:contents">
                      <div className="w-20 sm:w-auto">
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
                          Qty
                        </span>
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={row.qty}
                          onChange={(e) => {
                            // Clearing the field yields NaN, which then fails on
                            // a value the user can't see.
                            const parsed = Number(e.target.value);
                            updatePobRow(form, index, {
                              qty: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                            });
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1 sm:w-auto sm:flex-none">
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
                          Amount
                        </span>
                        <Input value={row.amount} disabled />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Remove item"
                        onClick={() => removeRow(index)}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addRow}>
                    + Add Item
                  </Button>

                  {total.qty > 0 ? (
                    <p className="text-sm font-medium">
                      {total.qty} qty · {total.amount.toFixed(2)}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => onOpenChange?.(false)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Saving…" : "Save POB"}
              </Button>
            </div>
          </div>
        </Form>
      </ModalContent>
    </Modal>
  );
}
