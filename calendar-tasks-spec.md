# Calendar Tasks — BUGS - Billing (PROJ-0007)

**Task sheet — clarified requirements**
**Source:** ERPNext project *BUGS - Billing* (`PROJ-0007`), Open tasks created by Administrator on 2026-07-21.
**Status:** Requirements clarified with product owner. **No code changed yet.**
**Codebase:** `shared/calendar/**` (Next.js shared calendar; pulled via `npm run copy-shared` — see [`shared-calendar-changes.md`](shared-calendar-changes.md)).

> ⚠️ Reminder: the 20 modified `shared/calendar` files are overwritten by `npm run copy-shared`. Push upstream to `elbrit-dev/playground` before pulling. Build these tasks with that in mind.

---

## Legend

- **Effort:** S = <½ day · M = ~1 day · L = multi-day / needs ERP field or new write path
- **Readiness:** 🟢 Ready to build · 🟡 Ready but coupled to another task · 🔴 Blocked (open decision)

---

## Summary

| # | Task | Theme | Effort | Readiness |
|---|------|-------|--------|-----------|
| [00180](#task-00180) | BE skips HQ tour plan → Dr-visit direct | Doctor-visit flow | L | 🟡 (with 00181) |
| [00181](#task-00181) | POB customer list auto-narrow to Dr-visit HQ | Doctor-visit flow | M | 🟡 (with 00180) |
| [00182](#task-00182) | Per-employee red tick + "force visit" tag | Doctor-visit display | S | 🟢 |
| [00183](#task-00183) | Initial visibility = own data only + joined events | Visibility | M | 🟢 |
| [00184](#task-00184) | All-day event cannot be GMeet | Meeting event | S | 🟡 (part of 00185) |
| [00185](#task-00185) | Meeting form changes on physical/virtual | Meeting event | L | 🔴 (confirm w/ Sanjay) |
| [00186](#task-00186) | Event-form employee picker: search + Filters button | Event form UX | M | 🟢 |
| [00187](#task-00187) | Auto-share upward for any shareable event | Sharing | M | 🟢 |
| [00188](#task-00188) | Host marks meeting attendance (meetings only) | Meeting event | L | 🟡 (with 00185) |
| [00189](#task-00189) | Card shows participant avatars + "+N" | Card display | S | 🟢 |

**Dependency notes**
- **00180 ↔ 00181** — the BE's single HQ is the territory source for both the Dr-visit flow and the POB customer narrowing. Build together.
- **00184 ⊂ 00185** — the all-day/GMeet rule is part of the physical/virtual meeting model.
- **00188 ↔ 00185** — meeting attendance depends on how physical/virtual meetings are structured.
- **00182 ↔ 00189** — both touch participant display (dialog ticks / card avatars).
- **00186** reuses the department/role derivation already built for the header filter (00183 area).

**Suggested build order:** 00182, 00189 (quick, self-contained) → 00183, 00187, 00186 → 00180 + 00181 (together) → **[resolve 00185 with Sanjay]** → 00185, 00184, 00188 (meeting cluster).

---

## TASK-00180 — BE skips HQ tour plan; Dr-visit direct {#task-00180}

**Original:** *"For the BE the HQ-tour plan need to be skipped they should directly have the Dr-visit."*

**Requirement**
- A **BE (Business Executive)** does **not** create an HQ Tour Plan. They create the **Dr-visit directly**, on **any day** (no date gate, no pre-existing HQ tour plan required).
- A BE is always tied to **one fixed HQ**, so the HQ/territory comes from the **BE's own record** (not from a matched tour-plan event).
- The **HQ Tour Plan still exists underneath** (implicit/auto): the Dr-visit is still kept **under an HQ Tour Plan** for data + **list views** (list unchanged — Dr-visit shown grouped under HQ Tour Plan) and so hierarchy-join logic is unchanged.
- **On the calendar grid, the HQ Tour Plan is NOT rendered as its own event/card for the BE** — the BE only sees the Dr-visit.
- **Other roles unchanged:** ABM joins the BE's plan as usual; ABM's own tour plan + Dr-visit → RBM joins → as today.

**Current behavior**
- Dr-visit creation is gated: the "Doctor Visit plan" tag button only appears when a matching HQ Tour Plan covers the selected date (`matchedHqEvent` → `hasValidHqTourPlan`).
- `hqTerritory` is auto-populated from `matchedHqEvent.hqTerritory`, which drives the doctor list and POB customer list.

**Touchpoints**
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — gate at `~1106-1127`; territory autofill `~1128-1139`; tag filter `~1702-1706`; doctor list `~1143-1153`; customer list `~1174-1218`.
- `shared/calendar/components/calendar/mobile/MobileAddEventBar.jsx` — same gate `~34-56`, `~65`, `~106-116` (must change too, or mobile still blocks BE).
- Role detection to reuse: `currentUserRoleId` `~386-410`; role-prefix parse `String(roleId).split("-")[0].replace(/[0-9]/g,"")` (as in `doctor-visit-dialog.jsx` `~124`, `~139-143`) → `"BE"`.

**Acceptance criteria**
- [ ] A BE can create a Dr-visit on any date with **no** pre-existing HQ tour plan (desktop **and** mobile).
- [ ] The doctor list and POB customer list filter correctly using the **BE's own HQ**.
- [ ] The HQ Tour Plan is **not shown as a separate event/card** on the calendar grid for the BE.
- [ ] **List view still shows** the Dr-visit grouped under the HQ Tour Plan.
- [ ] ABM/RBM join behavior is **unchanged**.

**Dependencies / open questions**
- Pairs with **00181** (shared HQ-territory source). Confirm exactly which employee field holds the BE's single HQ/territory.

---

## TASK-00181 — POB customer list auto-narrow to Dr-visit HQ {#task-00181}

**Original:** *"Customer filter is POB, need to add extra filter that is customers Territory filter."*

**Requirement**
- The POB Customer dropdown keeps its existing scope — **the employee's customer access**.
- On top of that, **automatically narrow to the Dr-visit's HQ**. Net list = *customers the employee can access* **AND** *in the Dr-visit's HQ*.
- **Automatic** — driven by the Dr-visit's HQ. **No** manual/visible territory dropdown.
- For a BE, the Dr-visit's HQ = the BE's single fixed HQ (see 00180).

**Current behavior**
- Effective filter today is employee customer-access. `fetchCustomersByTerritory(hqTerritory)` exists but discards `territory__name`; the query already selects it — so HQ narrowing isn't reliably wired.

**Touchpoints**
- `shared/calendar/components/calendar/module/event/services/event.service.js` — `fetchCustomersByTerritory` / `fetchAllCustomers` `~234-264` (stop discarding territory).
- `shared/calendar/components/calendar/module/event/graphql/events.query.js` — `CUSTOMER_QUERY` `~237-248` (already has `territory__name`).
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — customer options effect `~1174-1218`; combobox render `~2285-2305`.

**Acceptance criteria**
- [ ] Customer list is narrowed to the Dr-visit's HQ **and** the employee's access.
- [ ] For a BE, the list narrows to the BE's single HQ.
- [ ] **No** manual territory selector is added to the form.

**Dependencies:** pairs with **00180**.

---

## TASK-00182 — Per-employee red tick + "force visit" tag {#task-00182}

**Original:** *"If the visit is force visit then we need to show the tag near that employee who done force visit and also the tick need to be red."*

**Requirement**
- In the doctor-visit participant list (employee name + completion tick), for **only the participants who did a force visit**: change the tick from **green to red** and add a **"force visit" tag** next to that employee.
- Participants who visited normally keep the green tick and no tag.

**Current behavior**
- `custom_is_force_visit` is tracked **per participant** and already flows through the read mapper, but the dialog shows "Force visit" only at the **event level** (one rose badge), and per-participant ticks are **always green**. (Confirmed in the provided screenshot: both BE and ABM show green ticks.)

**Touchpoints**
- `shared/calendar/components/calendar/module/event/components/event-details/doctor-visit-dialog.jsx` — `resolveEmployeeParticipants` `~123-157` (doesn't read the per-participant force flag); tick render `~473-494`; event-level badge `~448-452`; reason block `~502-512`.
- Data already present: `shared/calendar/components/calendar/module/event/mappers/erp-to-event.js` `~108-109`.

**Acceptance criteria**
- [ ] Participant who force-visited shows a **red** tick + a **"force visit"** tag.
- [ ] Participant who visited normally shows the **green** tick, no tag.
- [ ] **No ERP change** required (data already flows through).

---

## TASK-00183 — Initial visibility = own data only; joined events surface {#task-00183}

**Original:** *"In the calendar the initial visibility only the logging in user initial visibility need to be visible only their data alone first."*

**Requirement**
- On first load, show **only the logged-in user's own data** (not the whole team/hierarchy).
- The **user filter** lets you navigate into another user's calendar and see their plans/events.
- If you **join** one of another user's events, that event must then **also become visible in your own events/calendar**.

**Current behavior**
- Default `selectedUserId = []` (= "All") → a manager sees the whole visible hierarchy on load. The mobile inline picker already forces self; the desktop popover does not.

**Touchpoints**
- `shared/calendar/components/calendar/contexts/calendar-context.jsx` — default selection `~100`.
- `shared/calendar/components/calendar/contexts/calendar-context/selectors.js` — `filterCalendarEvents` `~108-208`, `matchesSelectedUsers` `~129-140`.
- `shared/calendar/components/calendar/header/user-select.jsx` — `checkedIds` sync `~107-120`, `toggleAll` `~124-127`.

**Acceptance criteria**
- [ ] On first load, only the logged-in user's own events are shown.
- [ ] The filter still lets you view any other user's calendar you're allowed to see.
- [ ] After joining another user's event, that event appears in your own calendar.
- [ ] "All" is still reachable via the filter.

---

## TASK-00184 — All-day event cannot be GMeet {#task-00184}

**Original:** *"All day cannot be GMeet."* — inside the **Meeting** event.

**Requirement**
- In a Meeting event, **All-day** and **Google Meet** are **mutually exclusive** — an all-day meeting cannot have a Google Meet.

**Current behavior**
- `allDay` and `enableGoogleMeet` are independent checkboxes with no cross-field rule. GMeet flag → `add_video_conferencing` in ERP.

**Touchpoints**
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — checkboxes `~1813-1837`.
- `shared/calendar/components/calendar/schemas.js` — `~58-59`; add rule to `.superRefine` `~85-180`.
- `shared/calendar/components/calendar/module/event/mappers/event-to-erp.js` — GMeet mapping `~328-332` (defensive guard).

**Acceptance criteria**
- [ ] When "All day" is on, "Enable Google Meet" is disabled/cleared.
- [ ] Schema rejects all-day + GMeet.
- [ ] Mapper never requests a Meet link for an all-day meeting.

**Dependency:** part of **00185** (build together).

---

## TASK-00185 — Meeting form changes on physical/virtual {#task-00185}

**Original:** *"Physical and virtual meeting based on the selection the form need to be changed."*

**Requirement**
- A meeting can be **physical or virtual**; the form fields change with the selection:
  - **Virtual** → Google Meet link (reuses `enableGoogleMeet`).
  - **Physical** → location/venue field.

**🔴 OPEN DECISION (confirm with Sanjay) — do not build until resolved:**
- Are physical vs virtual **two separate event types**, or **one Meeting event with a physical/virtual selection toggle**?
- This decision also shapes **00184** (all-day rule) and **00188** (attendance).

**Current behavior**
- No physical/virtual concept exists anywhere; no venue/location field. Only the standalone `enableGoogleMeet` checkbox.

**Touchpoints**
- `shared/calendar/lib/calendar/form-config.js` — Meeting config `~165-195`.
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — Meeting branch `~1797-1875`.
- `shared/calendar/components/calendar/schemas.js` + `constants.js` — new `meetingMode` field + defaults.
- `event-to-erp.js` / `erp-to-event.js` — new ERP field mapping (physical venue needs a **new ERP field** — none exists today).

**Acceptance criteria (draft — finalize after decision)**
- [ ] User can mark a meeting physical or virtual.
- [ ] Virtual shows the Google Meet option; physical shows the location/venue field.
- [ ] The chosen mode persists to and reads back from ERP.

---

## TASK-00186 — Event-form employee picker: search + Filters button {#task-00186}

**Original:** *"For the employee search filter in the event form we need to add filter along with the search."*

**Requirement**
- Keep the search box, and add filtering — but **NOT** the header's inline designation/department dropdowns.
- Instead: a **search box + a "Filters" button** that opens a panel where the user sets their own filters (faceted filtering, like Amazon / other apps).

**Current behavior**
- Event-form pickers (Employees, Allocated To, Visible To, Share) use `RHFComboboxField` → `RHFCombobox` which is **search-only**. The header picker already has inline filter dropdowns (different UI — do not copy).

**Touchpoints**
- `shared/calendar/components/ui/RHFCombobox.jsx` — search box `~199-203`, filter predicate `~92-112`.
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — pickers `~2069-2106`, `~1997-2005`.
- Department not on employee options → derive from role edges (pattern in `header/user-select.jsx` `~167-193`).

**Acceptance criteria**
- [ ] Employee picker in the event form has a **Filters** button that opens a settable filter panel.
- [ ] Filters apply on top of the text search.
- [ ] UI is the faceted "Filters button" style, **not** the header's inline dropdowns.

---

## TASK-00187 — Auto-share upward for any shareable event {#task-00187}

**Original:** *"Need to do the auto share for the above hierarchy automatically."*

**Requirement**
- For **any event type** — if the event has a share option, the share happens **automatically** (no manual action), and **only upward** in the reporting hierarchy (managers above the creator: ABM → RBM → …), **never downward** to subordinates.

**Current behavior**
- Upward auto-share already exists, but only for **HQ Tour Plan + Doctor Visit Plan**. Meeting/Todo share with selected participants; Leave deliberately doesn't share.

**Touchpoints**
- `shared/calendar/components/calendar/dialogs/add-edit-event-dialog.jsx` — `getShareUserIds` `~515-529`, `superiorUserIds` `~457-465`.
- `shared/calendar/lib/employeeHeirachy.js` — `resolveSuperiorShareUserIds` `~183-204` (walks parent role chain).
- `shared/calendar/components/calendar/module/event/services/docshare.service.js` + `event.service.js` `~92-125` (DocShare write — already handles it).

**Acceptance criteria**
- [ ] Creating any shareable event auto-shares to superiors (upward) with **no** manual step.
- [ ] Sharing **never** goes downward to subordinates.
- [ ] Existing HQ-tour-plan / Dr-visit sharing still works.

---

## TASK-00188 — Host marks meeting attendance (meetings only) {#task-00188}

**Original:** *"Meeting attendance by the host of the meeting."*

**Requirement**
- The **host** of a meeting marks attendance of participants.
- **Meetings only** — NOT doctor visits. Meetings can be physical or virtual (see 00185).
- **No specific mechanism mandated** — implement whatever is **easiest for the host** to use.

**Current behavior**
- No meeting attendance exists. Meeting dialog shows a roster and a "Host" crown; the host is **derived** (highest-ranked ≥ ABM participant), not stored. Doctor-visit attendance uses per-participant `attending` but it's **self-marked** — no path for one person to mark another.

**Touchpoints**
- `shared/calendar/components/calendar/module/event/components/event-details/meeting-dialog.jsx` — roster `~85-113`.
- `shared/calendar/lib/meetingRoles.js` — host derivation `~59-73`.
- Doctor-visit pattern to mirror: `doctor-visit-dialog.jsx` `~473-494`; `attending` field write `event-to-erp.js` `~300`.

**Acceptance criteria**
- [ ] The host can mark each participant present/absent for a **meeting**.
- [ ] Not available for doctor visits.
- [ ] Minimal steps for the host (easy UX).

**Dependencies / open questions**
- Depends on **00185** structure. Host marking *others'* attendance needs a **new write path** (today attendance is self-only). Confirm whether host identification (currently heuristic) is reliable enough or needs an explicit ERP host field.

---

## TASK-00189 — Card shows participant avatars + "+N" {#task-00189}

**Original:** *"The card view of the event need to show the + like if there is extra employee then +2 like that."*

**Requirement**
- The event card currently shows only the creator's avatar (e.g. the "DR" circle). When another user **joins** (e.g. the ABM joins a BE's doctor visit), that joiner's **avatar/tag also appears** on the card.
- With more joiners, it collapses to a **"+N"** overflow (a few avatars + "+2").
- So the single avatar becomes an **avatar group of the participants who joined**.

**Current behavior**
- Event cards render only the creator avatar (no participant group). `AvatarGroup` already implements "+N" overflow but is only used in the header.

**Touchpoints**
- `shared/calendar/components/ui/avatar-group.jsx` — "+N" overflow already implemented `~16-28`.
- Card renderers: `views/month-view/month-event-badge.jsx` `~94-127`; `views/week-and-day-view/event-block.jsx` `~69-98`; agenda/list cards.
- Participants have no photo URL → fall back to colored initials (`getFirstLetters`, `getAvatarColorBySeed`).

**Acceptance criteria**
- [ ] Cards show an avatar group of the joined participants.
- [ ] Overflow beyond the max shows "+N".
- [ ] Avatars fall back to colored initials where no photo exists.

---

## Open items to resolve before full build

1. **TASK-00185** — physical vs virtual: separate event types **or** one event with a toggle? (Sanjay) — blocks 00185, shapes 00184 + 00188.
2. **TASK-00180 / 00181** — exact employee field that holds the BE's single HQ/territory.
3. **TASK-00188** — is derived-host reliable, or does ERP need an explicit host field for attendance ownership?
