import { toast } from "sonner";
import { set, addMinutes } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { saveEvent } from "@calendar/services/event.service";
import { TAG_FORM_CONFIG } from "./calendar/form-config";
export function buildParticipantsWithDetails(
  erpParticipants,
  { employeeOptions, doctorOptions }
) {
  return erpParticipants.map((p) => {
    const type = p.reference_doctype;
    const id = String(p.reference_docname);

    let name = id;
    let email = p.email ?? null;
    let roleId = null;

    if (type === "Employee") {
      const emp = employeeOptions.find(
        (e) => e.value === id
      );

      name = emp?.label ?? id;

      // Prefer ERP truth, fallback to option
      email = p.email ?? emp?.email ?? null;
      roleId = p.kly_role_id ?? emp?.roleId ?? null;
    }

    if (type === "Lead") {
      const doc = doctorOptions.find(
        (d) => d.value === id
      );

      name = doc?.label ?? id;

      // Lead only email
      email = p.email ?? doc?.email ?? null;
    }

    return {
      type,
      id,
      name,
      attending: p.attending ?? null,
      kly_lat_long: p.kly_lat_long ?? null,

      // ✅ NEW
      email,

      // ✅ Only Employee gets roleId
      ...(type === "Employee" && roleId
        ? { kly_role_id: roleId }
        : {}),
    };
  });
}


export function showFirstFormErrorAsToast(errors) {
  const findError = (obj) => {
    for (const key in obj) {
      if (obj[key]?.message) return obj[key].message;
      if (typeof obj[key] === "object") {
        const nested = findError(obj[key]);
        if (nested) return nested;
      }
    }
  };

  const message = findError(errors);
  if (message) toast.error(message);
}

export function getAvailableItems(allItems, selectedRows, currentValue) {
  const selectedIds = (selectedRows ?? [])
    .map(r => r.item__name)
    .filter(Boolean);

  return allItems.filter(item => {
    // ✅ keep current row item
    if (item.value === currentValue) return true;

    // ❌ remove items selected in other rows
    return !selectedIds.includes(item.value);
  });
}

  
  export function updatePobRow(form, index, patch) {
    const rows = [...(form.getValues("fsl_doctor_item") ?? [])];
  
    const current = rows[index] ?? {};
    const next = { ...current, ...patch };
  
    const qty = Number(next.qty || 0);
    const rate = Number(next.rate || 0);
  
    next.amount = qty * rate;
  
    rows[index] = next;
  
    form.setValue("fsl_doctor_item", rows, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

/* ---------------------------------------------
   POB ITEM → RATE SYNC
--------------------------------------------- */
export function syncPobItemRates(form, pobItems, itemOptions) {
  if (!pobItems?.length || !itemOptions?.length) return;

  pobItems.forEach((row, index) => {
    if (!row?.item__name) return;

    const item = itemOptions.find(i => i.value === row.item__name);
    if (!item) return;
    if (row.rate === item.rate) return;

    updatePobRow(form, index, {
      rate: Number(item.rate) || 0,
    });
  });
}

/* ---------------------------------------------
   GEO LOCATION HANDLER
--------------------------------------------- */
export function resolveLatLong(form, attending, isEditing, toast) {
  if (!isEditing) return;
  if (form.getValues("kly_lat_long")) return;

  const FALLBACK = JSON.stringify({ x: 0, y: 0 });

  const setFallback = () =>
    form.setValue("kly_lat_long", FALLBACK, {
      shouldDirty: true,
      shouldValidate: false,
    });

  if (!navigator.geolocation) {
    toast.warning("Location not supported. Using fallback.");
    setFallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const location = {
        x: pos.coords.latitude,
        y: pos.coords.longitude,
      };

      // ✅ Set location
      form.setValue(
        "kly_lat_long",
        JSON.stringify(location),
        { shouldDirty: true }
      );

      // ✅ Force attending = "Yes"
      form.setValue("attending", "Yes", {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    () => {
      toast.error("Unable to fetch location. Using fallback.");
      setFallback();
    },
    { timeout: 20000 }
  );
}
/* ---------------------------------------------
   NON-MEETING DATE NORMALIZATION
--------------------------------------------- */
export function normalizeNonMeetingDates(
  form,
  startDate,
  selectedTag,
  endDateTouched
) {
  if (!startDate) return;
  if (
    selectedTag === TAG_IDS.MEETING ||
    selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN 
  ) return;
  if (endDateTouched) return;

  const now = new Date();

  const normalizedStart = set(startDate, {
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: 0,
  });

  if (startDate.getTime() !== normalizedStart.getTime()) {
    form.setValue("startDate", normalizedStart, { shouldDirty: false });
  }

  const endDate = form.getValues("endDate");
  if (!endDate || endDate < startDate) {
    form.setValue(
      "endDate",
      set(startDate, { hours: 23, minutes: 59, seconds: 59 }),
      { shouldDirty: false }
    );
  }
}

/* ---------------------------------------------
   MEETING TIME HANDLER
--------------------------------------------- */
export function normalizeMeetingTimes(
  form,
  startDate,
  allDay,
  endDateTouched
) {
  if (!startDate || endDateTouched) return;

  const currentStart = form.getValues("startDate");
  const currentEnd = form.getValues("endDate");

  if (allDay) {
    const now = new Date();

    const nextStart = set(startDate, {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: 0,
    });

    const nextEnd = set(startDate, {
      hours: 23,
      minutes: 59,
      seconds: 59,
    });

    if (!currentStart || currentStart.getTime() !== nextStart.getTime()) {
      form.setValue("startDate", nextStart, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }

    if (!currentEnd || currentEnd.getTime() !== nextEnd.getTime()) {
      form.setValue("endDate", nextEnd, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }

    return;
  }

  const nextEnd = addMinutes(startDate, 60);

  if (!currentEnd || currentEnd.getTime() !== nextEnd.getTime()) {
    form.setValue("endDate", nextEnd, {
      shouldDirty: false,
      shouldValidate: false,
    });
  }
}


export async function joinDoctorVisit({
  erpName,
  existingParticipants,
  employeeId,
}) {
  return saveEvent({
    name: erpName,
    event_participants: [
      ...existingParticipants,
      {
        reference_doctype: "Employee",
        reference_docname: employeeId,
      },
    ],
  });
}
export async function leaveDoctorVisit({
  erpName,
  existingParticipants,
  employeeId,
}) {
  return saveEvent({
    name: erpName,
    event_participants: existingParticipants.filter(
      (p) =>
        !(
          p.reference_doctype === "Employee" &&
          String(p.reference_docname) === String(employeeId)
        )
    ),
  });
}

