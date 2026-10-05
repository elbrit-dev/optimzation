import { toast } from "sonner";
import { set, addMinutes } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { saveEvent } from "@calendar/components/calendar/module/event/services/event.service";

function normalizeAttendingChoice(value) {
  if (typeof value !== "string") return "";

  const normalized = value.trim().toLowerCase();

  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  if (normalized === "maybe") return "Maybe";

  return "";
}

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
      attending: normalizeAttendingChoice(p.attending),
      custom_latitude: p.custom_latitude ?? null,
      custom_longitude: p.custom_longitude ?? null,
      custom_distance: p.custom_distance ?? null,
      custom_visit_time: p.custom_visit_time ?? null,
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
  return message ?? null;
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
  export const getInitials = (name) => {
    const parts = String(name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "?";
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
// Browsers never re-show the location prompt once the user has blocked it —
// getCurrentPosition then fails instantly with PERMISSION_DENIED. All we can
// do is say exactly why and how to re-allow it. A dismissed (not blocked)
// prompt does re-appear on the next request, so the button keeps asking.
function getPlatform() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

async function getLocationPermissionState() {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

const SITE_PERMISSION_STEPS = {
  android:
    "Tap the lock icon next to the address bar → Permissions → Location → Allow. (Installed app: Chrome ⋮ → Settings → Site settings → Location → this site → Allow.) Then tap Request Location again.",
  ios: "Open iPhone Settings → Safari → Location → Allow (or tap “aA” in the address bar → Website Settings → Location → Allow). Then tap Request Location again.",
  desktop:
    "Click the lock icon next to the address bar → Location → Allow, then reload and tap Request Location again.",
};

const DEVICE_PERMISSION_STEPS = {
  android:
    "Open phone Settings → Apps → Chrome → Permissions → Location → Allow, then tap Request Location again.",
  ios: "Open iPhone Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, then tap Request Location again.",
  desktop:
    "Allow your browser to use location in your computer's privacy settings, then tap Request Location again.",
};

function describeLocationError(err, stateBefore) {
  const platform = getPlatform();

  if (err?.code === 1) {
    if (stateBefore === "denied") {
      return {
        title: "Location is blocked for this site",
        description: SITE_PERMISSION_STEPS[platform],
      };
    }
    if (stateBefore === "granted") {
      // Site is allowed, so it's the OS refusing the browser itself.
      return {
        title: "Your phone isn't letting the browser use location",
        description: DEVICE_PERMISSION_STEPS[platform],
      };
    }
    return {
      title: "Location permission was denied",
      description: `Tap Request Location and choose Allow. If no popup appears: ${SITE_PERMISSION_STEPS[platform]}`,
    };
  }

  if (err?.code === 2) {
    return {
      title: "Your device location is turned off",
      description:
        "Turn on Location (GPS) from the quick settings panel, then tap Request Location again.",
    };
  }

  if (err?.code === 3) {
    return {
      title: "Couldn't get your location in time",
      description:
        "GPS signal is weak. Move near a window or outdoors, then tap Request Location again.",
    };
  }

  return {
    title: "Unable to fetch location",
    description: "Please tap Request Location to try again.",
  };
}

export async function resolveLatLong(form, isEditing, toast) {
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

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    toast.error("Location needs a secure (https) page", {
      description: "Open the calendar from its https:// link and try again.",
      duration: 10000,
    });
    setFallback();
    return;
  }

  if (!navigator.geolocation) {
    toast.warning("This browser can't share your location", {
      description: "Open the calendar in Chrome or Safari and try again.",
      duration: 10000,
    });
    setFallback();
    return;
  }

  const stateBefore = await getLocationPermissionState();

  await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
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
      resolve();
    },
    (err) => {
      const { title, description } = describeLocationError(err, stateBefore);
      toast.error(title, { description, duration: 15000 });
      setFallback();
      resolve();
    },
    // A fix from the last minute is fine for a visit; reusing it avoids a
    // cold-GPS timeout on every open.
    { timeout: 30000, maximumAge: 60000 }
  ));
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
      doctorCode: node.custom_doctor_code ?? null,
      // ERP holds the speciality in whichever of the two fields the record was
      // created with — the Link field on newer rows, the free-text one on older
      // ones. Reading only `custom_speciality` left most doctors with a blank
      // speciality (and an empty speciality filter).
      fsl_speciality__name:
        node.custom_specialty__name ?? node.custom_speciality ?? null,
      email: node.email_id,
      // The primary category. category1/2/3 are a smaller legacy set kept below.
      fsl_category__name: node.custom_category__name ?? null,
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
  // Meetings and visit plans have their own time control, so the time they
  // hold is the user's choice; a travel request keeps midnight (date only).
  // Neither must be reset to "now".
  if (
    selectedTag === TAG_IDS.MEETING ||
    selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN ||
    selectedTag === TAG_IDS.TRAVEL_REQUEST
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


// Join and leave only ever change the acting employee's own membership. The
// other rows come from ERP inside saveEvent, so a stale browser copy can't
// clobber another participant's recorded visit (see mergeParticipantRows).
export async function joinDoctorVisit({ erpName, employeeId }) {
  return saveEvent(
    {
      name: erpName,
      event_participants: [
        {
          reference_doctype: "Employee",
          reference_docname: employeeId,
        },
      ],
    },
    { mergeParticipants: { actingEmployeeId: employeeId } }
  );
}
export async function leaveDoctorVisit({ erpName, employeeId }) {
  return saveEvent(
    {
      name: erpName,
      event_participants: [],
    },
    {
      mergeParticipants: {
        actingEmployeeId: employeeId,
        removedEmployeeIds: [employeeId],
      },
    }
  );
}
