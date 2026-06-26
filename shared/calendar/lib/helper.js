import { toast } from "sonner";
import { set, addMinutes } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { saveEvent } from "@calendar/components/calendar/module/event/services/event.service";
export function buildParticipantsWithDetails(
  erpParticipants,
  { employeeOptions }
) {
  return erpParticipants
    .filter((participant) => participant.reference_doctype === "Employee")
    .map((p) => {
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

    return {
      type,
      id,
      name,
      attending: p.attending ?? null,
      custom_latitude: p.custom_latitude ?? null,
      custom_longitude: p.custom_longitude ?? null,
      custom_distance: p.custom_distance ?? null,
      custom_is_force_visit: p.custom_is_force_visit ?? false,
      custom_force_visit_reason:
        p.custom_force_visit_reason ?? "",

      // ✅ NEW
      email,

      // ✅ Only Employee gets roleId
      ...(type === "Employee" && roleId
        ? {
            kly_role_id: roleId,
            role_profile: p.role_profile ?? roleId,
          }
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
  export const getInitials = (name = "") => {
    const parts = name.split(" ");
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };
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
export function resolveLatLong(form, isEditing, toast) {
  if (!isEditing) return;

  const currentLatitude = form.getValues("custom_latitude");
  const currentLongitude = form.getValues("custom_longitude");

  if (currentLatitude && currentLongitude) return;

  const setFallback = () => {
    form.setValue("custom_latitude", "", {
      shouldDirty: true,
      shouldValidate: false,
    });

    form.setValue("custom_longitude", "", {
      shouldDirty: true,
      shouldValidate: false,
    });
  };

  if (!navigator.geolocation) {
    toast.warning("Location not supported. Using fallback.");
    setFallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latitude = parseFloat(pos.coords.latitude);
      const longitude = parseFloat(pos.coords.longitude);

      // ✅ Set latitude
      form.setValue(
        "custom_latitude",
        latitude,
        { shouldDirty: true }
      );

      // ✅ Set longitude
      form.setValue(
        "custom_longitude",
        longitude,
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
export function mapDoctors(data) {
  return (
    data?.Leads?.edges.map(({ node }) => ({
      doctype: "Lead",
      value: node.name,
      label: node.lead_name,
      custom_latitude: node.custom_latitude ?? null,
      custom_longitude: node.custom_longitude ?? null,
      city: node.city,
      code: node.name,
      fsl_speciality__name: node.custom_speciality,
      email: node.email_id,
      fsl_category1__name: node.custom_category1__name,
      fsl_category2__name: node.custom_category2__name,
      fsl_category3__name: node.custom_category3__name,
      territory__name: node.territory__name,
      notes: (node.notes ?? [])
        .map((n) => ({
          note: n.note,
          creation: n.creation,
          name: n.name,
          idx: n.idx,
          doctype: n.doctype,
          modified: n.modified,
        }))
        .sort(
          (a, b) =>
            new Date(b.creation) - new Date(a.creation)
        ),
    })) || []
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

  form.setValue("endDate", normalizedStart, {
    shouldDirty: false,
    shouldValidate: false,
  });
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
