# Calendar — Session Change Log

All paths are under `shared/calendar/`. **25 files changed (1 new)**, plus 2 touched-then-reverted.

---

## 1. Functional fixes

| File | Why it was changed |
|---|---|
| `components/CalendarPage.js` | **Mounted Sonner `<Toaster>`** — it was only in `shared/calendar/pages/_app.js`, which never mounts in the Plasmic app, so every `toast()` was a silent no-op. This was hiding real errors. |
| `components/calendar/schemas.js` | **Coerced number fields** (`custom_latitude`, `custom_longitude`, `distanceKm`, POB `qty/rate/amount`) with `z.coerce.number()` — string/empty values from ERP were silently failing validation (`"expected number, received string"`) and **blocking every Update** before any network call. Also added `halfDayPosition` enum + its validation. |
| `components/calendar/dialogs/add-edit-event-dialog.jsx` | The largest set of changes: <br>• Update submit fires via `onClick` (not the fragile `form="event-form"` link across nested modals) <br>• Employee picker = user's **department**, plus keeps already-attached participants on edit <br>• Half-day **position** picker (First day / Last day) <br>• Half Day shown **only for head-office** roles (IT/MIS/HR/PMT/Design) <br>• **Tag-aware sharing** (HQ/Doctor Visit = hierarchy; Meeting/Todo/Other = participants) <br>• Removed DocShare for Leave (approval workflow handles it) <br>• **HQ same-day** and **Doctor same-day** duplicate guards with clear messages <br>• `onInvalid` always toasts; correct create vs update success messages <br>• Geolocation effect scoped to **open Doctor-Visit edits** only (was firing on every detail open) <br>• Medical-cert upload only when a **new file** is chosen (was re-uploading the existing URL string) |
| `components/calendar/form-fields.jsx` | `FormFooter` submits programmatically via `onClick` so Update works inside the nested edit modal. |
| `components/calendar/contexts/calendar-context/selectors.js` | **Event owner included in visibility** — a creator now always sees their own event (fixed meeting-not-visible-to-creator). |
| `lib/employeeHeirachy.js` | Added `resolveLoggedInRoleId` (fixes stale host `me.roleId`), `resolveDepartmentRoleIds`; downward-only visibility walk; `resolveVisibleRoleIds` takes an explicit role id. |
| `components/calendar/contexts/calendar-context.jsx` | Pass the resolved role into the visibility walk (event filtering + dropdown). |
| `components/calendar/helpers.js` | `findOverlappingHqEvent` keys on HQ (same-HQ-same-day only; different HQ allowed). Extended `getStatusBadgeClass` to color all statuses (Approved/Rejected/Cancelled/Pending). |
| `components/calendar/hooks.js` | Delete now surfaces the **real ERP error** message instead of a generic "Error deleting event." |
| `components/calendar/module/event/services/master-data.service.js` | **Active-only employee fetch** — Left employees (stale role profiles, no User) were polluting dropdowns and breaking hierarchy DocShare. |
| `components/calendar/module/event/graphql/events.query.js` | Added `is_group` (role node) for the hierarchy; added `google_meet_link` for the Meeting "Join Meet" button. |
| `components/calendar/module/leave/mappers/leave.mapper.js` | Half-day logic (keep full date range; set `half_day_date` from the chosen position); added `postingDate` (Applied On). |
| `components/calendar/constants.js` | `buildEventDefaultValues` derives `halfDayPosition` on edit. |
| `lib/calendar/form-config.js` | Added "Applied On" to the Leave detail fields. |
| `components/calendar/calendar.jsx` | `h-screen` → `h-full` so the calendar fits its Plasmic container instead of overflowing 100vh below the app topbar. |

---

## 2. UI redesign (event details + month view)

| File | Why it was changed |
|---|---|
| `components/calendar/dialogs/event-details/detail-ui.jsx` | **New** — shared compact UI kit: summary strip, labelled rows, status pill, person chips, responsive footer. |
| `components/calendar/module/event/components/event-details/default-dialog.jsx` | Meeting/Other/HQ detail redesign + **Join Google Meet** button. |
| `components/calendar/module/leave/components/leave-dialog.jsx` | Leave detail redesign, colored status pill, responsive footer. |
| `components/calendar/module/todo/components/todo-dialog.jsx` | Todo detail redesign, participant chips, removed stray `console.log`. |
| `components/calendar/module/event/components/event-details/doctor-visit-dialog.jsx` | Summary header + HQ + distance/force-visit + responsive footer. |
| `components/calendar/dialogs/event-details-dialog.jsx` | Mobile-safe dialog (max-height + scroll + edge margin + wrapping title). |
| `components/calendar/dialogs/delete-event-dialog.jsx` | Added `className` prop so the Delete button can be full-width on mobile. |
| `components/calendar/views/month-view/day-cell.jsx` | Events-per-day 1 → 2; subtle cell hover affordance. |
| `components/calendar/views/month-view/month-event-badge.jsx` | Event chip polish (medium weight, subtle shadow, pointer cursor). |
| `components/calendar/views/month-view/calendar-month-view.jsx` | Weekday header styling (uppercase, spaced). |

---

## 3. Touched but reverted (net no change)

| File | Note |
|---|---|
| `components/calendar/module/todo/graphql/todo.query.js` | Added a "Linked to" (`reference_type/name`) field, then **removed it** — it required DocType read permission that BE users lack and broke the ToDo list query. Back to original. |
| `components/calendar/module/todo/mappers/todo.mapper.js` | Mapped/un-mapped the same reference fields. Back to original. |

---

## Key issues resolved this session

- **Edit/Update failed for every event** → root cause was a *silent* zod validation error on number fields (hidden because the Toaster wasn't mounted). Fixed by mounting the Toaster + coercing the number fields.
- **ToDo "No permission for DocType"** → a `reference_type { name }` subquery read the restricted DocType doctype; removed.
- **Meeting not visible to its creator** → visibility check ignored the owner; now included.
- **HQ Tour Plan duplicated** on same HQ/day → guard added (different HQ same day still allowed).
- **Doctor visited twice same day** → guard added.
- **"Unable to fetch location" toast on every detail open** → geolocation scoped to open Doctor-Visit edits.
- **Leave update "file_name/file_url must be set"** → only upload a *new* medical certificate, not the existing URL string.
- **Calendar overflowed the viewport** in Plasmic → `h-full` instead of `h-screen`.
- **Department-aware dropdowns & role hierarchy** (BE sees self; ABM sees team; event form shows whole department).
- **Event-details UI** redesigned for fast mobile reading + manager clarity, with useful extras (Join Meet, HQ, distance, Applied-on).

## Open / needs decision

- **Delete on some events** (e.g. a Meeting with a Google Meet link, or events the user doesn't own) → **server-side ERP permission / Google-Calendar link**, not the calendar code.
- **Calendar height** assumes the Plasmic slot has a height; if it ever collapses, set the CalendarPage slot to stretch (or switch `h-full` to `calc(100vh - <topbar>)`).

---

## 4. Post-deploy hotfixes (surfaced once the Toaster was live)

| File | Why it was changed |
|---|---|
| `lib/helper.js` | **`getInitials` made null/empty-safe** — a ToDo comment with a null author (`comment_by`) called `null.split(" ")`, throwing inside `TodoComments` and crashing the whole calendar (the "ToDo disappears, refresh shows it, then errors" loop). Now returns `?` for null/empty. *(This file was also changed earlier: `showFirstFormErrorAsToast` returns the message so validation always toasts.)* |
| `components/ui/error-boundary.jsx` | **New** — a small React error boundary so one bad record can't blank the whole calendar again; shows a fallback instead. |
| `components/calendar/dialogs/event-details-dialog.jsx` | Wrapped the detail-view content in `<ErrorBoundary>` (also got the mobile-safe dialog change in §2). |
| `components/calendar/dialogs/add-edit-event-dialog.jsx` | Wrapped the edit-form `TodoComments` in `<ErrorBoundary>`. |

**Updated tally:** 27 files changed (3 new — `detail-ui.jsx`, `error-boundary.jsx`, plus the new Toaster mount logic), 2 touched-then-reverted.
