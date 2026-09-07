"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@calendar/components/ui/button";
import { Input } from "@calendar/components/ui/input";
import { Form } from "@calendar/components/ui/form";
import { RHFComboboxField } from "@calendar/components/calendar/form-fields";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { resolveLoggedInRoleId } from "@calendar/lib/employeeHeirachy";
import { resolvePobDepartments } from "@calendar/lib/calendar/pobDepartments";
import { getAvailableItems, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import { fetchItemsByDepartment } from "@calendar/components/calendar/module/event/services/master-data.service";
import { fetchAllCustomers, saveVisitPob } from "@calendar/components/calendar/module/event/services/event.service";
import { mapDoctorVisitToQuotation } from "@calendar/components/calendar/module/event/mappers/quotation-to-erp";

const EMPTY_ROW = { item__name: "", qty: 1, rate: 0, amount: 0 };

function resolveDoctorId(doctor) {
    const value = Array.isArray(doctor) ? doctor[0] : doctor;
    if (!value) return null;
    return typeof value === "object" ? value.value ?? value.name ?? null : value;
}

/**
 * POB capture for a visit, edited in place on the details dialog.
 *
 * Deliberately NOT the full event form: POB gets added and corrected after the
 * fact, and reopening the whole visit form to do it puts everything else — the
 * date, the participants, the recorded location — back in play. This edits the
 * POB and saves only the POB.
 */
export function VisitPobEditor({ event, onDone }) {
    const { elbritRoleEdges, users, updateEvent } = useCalendar();
    const [itemOptions, setItemOptions] = useState([]);
    // Loaded here rather than read from calendar context: the shared list is
    // populated (and narrowed) by the event form, which may never have been
    // opened for this visit.
    const [customerOptions, setCustomerOptions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm({
        mode: "onChange",
        defaultValues: {
            pob_given: Number(event?.pob_given) === 1 ? 1 : 0,
            customer: event?.customer ?? "",
            fsl_doctor_item: Array.isArray(event?.fsl_doctor_item)
                ? event.fsl_doctor_item.map((row) => ({
                      item__name: row.item__name ?? "",
                      qty: Number(row.qty) || 1,
                      rate: Number(row.rate) || 0,
                      amount: Number(row.amount) || 0,
                  }))
                : [],
        },
    });

    const pobGiven = form.watch("pob_given");
    const customer = form.watch("customer");
    const pobItems = form.watch("fsl_doctor_item");

    const departments = useMemo(
        () => resolvePobDepartments(elbritRoleEdges, resolveLoggedInRoleId(users)),
        [elbritRoleEdges, users]
    );
    const hasResolvedDepartment = departments.length > 0;

    useEffect(() => {
        if (Number(pobGiven) !== 1) return;
        if (itemOptions.length) return;

        fetchItemsByDepartment(departments).then(setItemOptions);
    }, [departments, itemOptions.length, pobGiven]);

    // Billing runs through the customers of the visit's own HQ territory.
    useEffect(() => {
        if (Number(pobGiven) !== 1) return;

        const territory = event?.hqTerritory;
        if (!territory) {
            setCustomerOptions([]);
            return;
        }

        let cancelled = false;

        fetchAllCustomers()
            .then((customers) => {
                if (cancelled) return;
                setCustomerOptions(
                    customers
                        .filter((entry) => entry.territory === territory)
                        .map((entry) => ({
                            label: entry.name,
                            value: entry.name,
                        }))
                );
            })
            .catch((error) => {
                console.error("Failed to fetch accessible customers", error);
                if (!cancelled) setCustomerOptions([]);
            });

        return () => {
            cancelled = true;
        };
    }, [event?.hqTerritory, pobGiven]);

    // Rates live on the item master, not on the row — pull them across whenever
    // the item list or the chosen items change so Amount is never stale.
    useEffect(() => {
        syncPobItemRates(form, pobItems, itemOptions);
    }, [pobItems, itemOptions]);

    const total = useMemo(() => {
        return (pobItems ?? []).reduce(
            (acc, row) => {
                acc.qty += Number(row.qty) || 0;
                acc.amount += Number(row.amount) || 0;
                return acc;
            },
            { qty: 0, amount: 0 }
        );
    }, [pobItems]);

    const addRow = () => {
        form.setValue("fsl_doctor_item", [...(pobItems ?? []), { ...EMPTY_ROW }], {
            shouldDirty: true,
        });
    };

    const removeRow = (index) => {
        const rows = [...(form.getValues("fsl_doctor_item") ?? [])];
        rows.splice(index, 1);
        form.setValue("fsl_doctor_item", rows, { shouldDirty: true });
    };

    const handleSave = async () => {
        const values = form.getValues();
        const givesPob = Number(values.pob_given) === 1;
        const rows = givesPob ? values.fsl_doctor_item ?? [] : [];

        if (givesPob) {
            if (!values.customer) {
                toast.error("Select a customer for this POB");
                return;
            }

            if (!rows.length) {
                toast.error("Add at least one item");
                return;
            }

            if (rows.some((row) => !row.item__name)) {
                toast.error("Every row needs an item");
                return;
            }

            if (rows.some((row) => !(Number(row.qty) > 0))) {
                toast.error("Every item needs a quantity");
                return;
            }
        }

        setIsSaving(true);

        try {
            const doctorId = resolveDoctorId(event.doctor);
            const quotationDoc = givesPob
                ? mapDoctorVisitToQuotation({
                      values: {
                          customer: values.customer,
                          startDate: event.startDate,
                          endDate: event.endDate ?? event.startDate,
                          fsl_doctor_item: rows,
                      },
                      doctorId,
                      // Reuse the visit's quotation so an edit revises it instead
                      // of raising a second one against the same visit.
                      existingName: event.reference_docname || null,
                      eventName: event.erpName,
                  })
                : null;

            const saved = await saveVisitPob({
                erpName: event.erpName,
                pobGiven: values.pob_given,
                quotationDoc,
            });

            updateEvent({
                ...event,
                pob_given: givesPob ? 1 : 0,
                fsl_doctor_item: rows,
                customer: givesPob ? values.customer : undefined,
                ...(saved.reference_docname
                    ? {
                          reference_doctype: { name: saved.reference_doctype },
                          reference_docname: saved.reference_docname,
                      }
                    : {}),
            });

            toast.success("POB saved");
            onDone?.();
        } catch (error) {
            console.error("Failed to save POB", error);
            toast.error(error?.message || "Couldn't save the POB");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Form {...form}>
            <div className="space-y-3 rounded-lg border p-3">
                <div className="flex gap-6">
                    {[1, 0].map((option) => (
                        <label
                            key={option}
                            className="flex items-center gap-2 text-sm"
                        >
                            <input
                                type="radio"
                                checked={Number(pobGiven) === option}
                                onChange={() =>
                                    form.setValue("pob_given", option, {
                                        shouldDirty: true,
                                    })
                                }
                            />
                            <span>{option === 1 ? "Yes" : "No"}</span>
                        </label>
                    ))}
                </div>

                {Number(pobGiven) === 1 && (
                    <>
                        <RHFComboboxField
                            name="customer"
                            label="Customer"
                            options={customerOptions}
                            multiple={false}
                            placeholder="Select Customer"
                            searchPlaceholder="Search customer"
                        />

                        {/* An empty item dropdown is indistinguishable from a
                            broken search, so name the cause. */}
                        {!hasResolvedDepartment && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                No product department is mapped to your role
                                profile, so no items can be listed. Ask MIS to map
                                a department to it.
                            </p>
                        )}

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
                                                options={getAvailableItems(
                                                    itemOptions,
                                                    pobItems,
                                                    row.item__name
                                                )}
                                                tagsDisplay={false}
                                                multiple={false}
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
                                                        // Clearing the field yields
                                                        // NaN, which then fails on a
                                                        // value the user can't see.
                                                        const parsed = Number(
                                                            e.target.value
                                                        );
                                                        updatePobRow(form, index, {
                                                            qty:
                                                                Number.isFinite(parsed) &&
                                                                parsed > 0
                                                                    ? parsed
                                                                    : 1,
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
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addRow}
                                    >
                                        + Add Item
                                    </Button>

                                    {total.qty > 0 && (
                                        <p className="text-sm font-medium">
                                            {total.qty} qty ·{" "}
                                            {total.amount.toFixed(2)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                <div className="flex justify-end gap-2 border-t pt-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => onDone?.()}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={isSaving}
                        onClick={handleSave}
                    >
                        {isSaving ? "Saving…" : "Save POB"}
                    </Button>
                </div>
            </div>
        </Form>
    );
}
