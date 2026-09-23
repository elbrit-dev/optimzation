/* The contract between the data source and everything above it.
 *
 * THIS FILE IS THE SEAM. Today `useVisitKpi` fills these shapes from
 * `mockData.js`; tomorrow it fills them from the ERPNext GraphQL endpoint.
 * Nothing else in the feature may know which of the two it got — no component
 * imports mockData, and no component reads a `custom_*` field name.
 *
 * A VisitRow is ONE PLANNED VISIT, already joined. On the wire it arrives as
 * an Event with a nested `event_participants` array; the row below is the
 * flattened form:
 *
 *   Event.name                              -> eventId
 *   Event.starts_on                         -> plannedDate   (date only; the
 *                                              doctype has all_day = 1, so
 *                                              there is never a time here)
 *   Event.custom_employee_id__name          -> employeeId
 *   Event.custom_doctor__name               -> doctorId
 *
 * The two NAME fields are not on the Event at all. A link field's `name` is
 * the linked record's primary key -- "E01102", "DR-60005" -- so both had to
 * be resolved from the linked doctype: `employeeName` against the roster
 * this screen already fetches, `doctorName` from the Lead's own `lead_name`.
 * See liveSource.js; printing a key where a name belongs is the bug this
 * note exists to stop coming back.
 *   Event.custom_hq__name                   -> hq
 *   Event.custom_pob_given                  -> pobGiven
 *   participant.custom_visit_time           -> visitTime     (null = not done)
 *   participant.custom_distance             -> distanceKm
 *   participant.custom_is_force_visit       -> forceVisit
 *   participant.custom_force_visit_reason   -> forceVisitReason ('' = none)
 *   participant.reference_doctype__name     -> participantRefType
 *   participant.reference_docname__name     -> participantRef
 *
 * TWO DIFFERENT PEOPLE LIVE ON THIS ROW, and the difference is the whole
 * reason `participantId` exists:
 *
 *   employeeId    - Event.custom_employee_id. WHOSE PLAN this is, and what
 *                   every KPI, HQ card, chart bar and tree node aggregates
 *                   on. Unchanged and load-bearing.
 *   participantId - the child row's own person. WHO ACTUALLY ATTENDED. The
 *                   participant table is a DYNAMIC link: on a Doctor Visit
 *                   plan it points at an Employee, so the value is already
 *                   the roster key ("E00869"); on the calendar-synced events
 *                   it points at a User and has to be resolved by login
 *                   email. null when it resolves to nobody on the roster --
 *                   deliberately NOT promoted into employeeId, because a
 *                   wrong id there is a wrong number everywhere.
 *
 * On a single-participant Event the two are the same person. They diverge on
 * a joint call, which is what the drill-down sheets group and expand.
 *
 * JOINT CALLS ARE ~21% OF THE PLAN. Of 400 live September events, 315 had one
 * participant, 84 had two and one had three: 486 rows for 400 calls.
 *
 * WHICH MEANS COUNTING ROWS OVER-COUNTS. `planned()` and `happened()` count
 * VisitRows, and all the rows of a joint call carry the same `employeeId`, so
 * one plan attended by a rep and their manager scores two planned visits
 * against that rep. Everything aggregate on this screen inherits that. It is
 * recorded here rather than fixed because the fix moves every number on the
 * dashboard, which is a decision and not a cleanup.
 *
 * `eventId` IS NOT A ROW KEY. An Event carries an array of participants and
 * this row is the flattened form, so one Event with two participants is two
 * rows sharing an eventId. Anything that needs to identify a row uniquely --
 * a React key, a map -- has to add something to it; see doctorPlan().
 * Conversely, GROUPING by eventId is how the sheets rebuild the call that
 * the flattening took apart -- see visitsIn / doctorPlan.
 *
 * The two derived facts the whole screen rests on:
 *   PLANNED  = the row exists
 *   HAPPENED = row.visitTime != null
 *
 * @typedef {Object} VisitRow
 * @property {string}      eventId
 * @property {string}      subject
 * @property {string}      plannedDate   'YYYY-MM-DD'
 * @property {string}      employeeId
 * @property {string}      employeeName
 * @property {string}      doctorId
 * @property {string}      doctorName
 * @property {string}      doctorCity      Lead.city, '' when unset
 * @property {string}      doctorSpecialty   Lead.custom_specialty ('CARDIO',
 *                                         'CP', 'GP', 'ORTHO'…), '' when unset
 * @property {string[]}    doctorCategories  Lead.custom_category + 1,2,3 with the
 *                                         blanks dropped ('C', 'LILR', 'EC10')
 * @property {string}      hq
 * @property {string}      department
 * @property {boolean}     pobGiven
 * @property {string|null} visitTime     'YYYY-MM-DD HH:mm:ss', or null
 * @property {number|null} distanceKm
 * @property {boolean}     forceVisit
 * @property {string}      forceVisitReason  free text, '' when none was given
 * @property {string}      participantRef     the dynamic link's value
 * @property {string}      participantRefType 'Employee' | 'User' | ''
 * @property {string|null} participantId     that person as a roster employee
 * @property {string}      participantName   resolved name, else the email
 * @property {number}      participantCount  DISTINCT people on the event, 1
 *                                         for a solo call. Read off the
 *                                         Event's own participant table, not
 *                                         counted from these rows: scope the
 *                                         screen to one rep and their
 *                                         manager's row is filtered out, so a
 *                                         row count would call every joint
 *                                         call in that scope solo.
 *
 * A TeamMember is one node of the reporting hierarchy. `reportsTo` is
 * Employee.reports_to; `designation` is the raw ERPNext designation, which is
 * why DESIGNATION_SHORT exists rather than the abbreviations being stored.
 *
 * `vacant` has no ERPNext FIELD behind it -- see PLAN.md §2.6 and
 * liveSource.js's isVacantId -- it is inferred from the "V..." employee ID
 * naming series HR uses for a placeholder record on an open seat. It is
 * carried on the member so the rule lives in ONE place (the data source)
 * rather than being re-derived by every consumer.
 *
 * @typedef {Object} TeamMember
 * @property {string}      id
 * @property {string}      name
 * @property {string}      designation
 * @property {string|null} reportsTo
 * @property {string}      hq
 * @property {boolean}     vacant
 * @property {boolean}     onLeave         out TODAY (the leave calendar as
 *                                          of now)
 * @property {boolean}     onLeaveInWindow had approved leave at any point in
 *                                          the SELECTED window. attendanceOf
 *                                          reads whichever the period asks
 *                                          for; only `vacant` is as-of-now in
 *                                          both.
 * @property {string|null} roleProfile  Employee.custom_role_profile. The node
 *                                  in the Role Profile TREE this person sits
 *                                  at; the roster is narrowed to the subtree
 *                                  under "Sales" (see liveSource's inSales).
 *                                  null for the 65 active employees who have
 *                                  none, who fall back to the designation
 *                                  ladder rather than being dropped.
 * @property {string|null} userId   Employee.user_id -- the login this person
 *                                  is, used only to match a Quotation's
 *                                  `owner` back to a TeamMember (see
 *                                  PobEntry below); nothing else reads it.
 *
 * A PobEntry is one real order attributed to one visit-day's POB (Personal
 * Order Booking) figure -- money, not the `custom_pob_given` checkbox
 * `pobGiven` above reads. ASSUMED, NOT YET VERIFIED against real ERP data:
 * neither available API token could see a Lead-targeted Quotation to confirm
 * this directly (Quotation is permission-scoped the same way Event is — see
 * conversation history). Modelled on:
 *
 *   Quotation.quotation_to = 'Lead'      -- the doctor is a CRM Lead, not a
 *                                           Customer, on this instance
 *   Quotation.party_name                 -> doctorId   (matches
 *                                           VisitRow.doctorId, e.g. "DR-18854")
 *   Quotation.owner                      -> resolved to employeeId via
 *                                           TeamMember.userId (the "created
 *                                           by" sales contributor)
 *   Quotation.grand_total (or .total)    -> amount
 *   Quotation.transaction_date           -> plannedDate
 *
 * `employeeId` and `plannedDate` are named to match VisitRow on purpose, not
 * because a PobEntry IS a visit -- it lets `forEmployees`/`inPeriod` scope
 * both without a second copy of that filtering. If this join turns out wrong
 * once verified, the fix is isolated to fetchPobQuotations in liveSource.js;
 * nothing downstream (pobTotal, KpiGrid) cares how the number was produced.
 *
 * @typedef {Object} PobEntry
 * @property {string} employeeId
 * @property {string} doctorId
 * @property {number} amount
 * @property {string} plannedDate  'YYYY-MM-DD'
 */

/* ERPNext stores the long form. Every label on the screen wants the short
   one, and the mapping belongs here rather than in a component so a new
   designation shows up as itself instead of as `undefined`. */
/* An HQ is a Territory whose name starts with "HQ-", and nothing else is.
 *
 * The Territory tree carries states, zones and countries alongside the HQs --
 * "Tn-Coimbatore", "India" -- and an Event or an Employee can be pointed at
 * any of them. Treated as HQs those become cards for places nobody has an HQ
 * in, and an unset territory ('') becomes a nameless card sitting in the
 * strip. Neither is a territory a rep can be said to work in.
 *
 * The prefix is the only signal available: Territory has no "is an HQ" flag,
 * and `is_group` marks the branches of the tree rather than this distinction. */
export function isHqTerritory(hq) {
  return /^HQ-/.test(String(hq ?? ''));
}

export const DESIGNATION_SHORT = {
  'Business Executive': 'BE',
  'Area Business Manager': 'ABM',
  'Regional Business Manager': 'RBM',
  /* Seniority variants of the same RBM role -- ERPNext stores them as
     distinct designations, but nothing in this screen's hierarchy or
     attendance logic cares about the difference. Mapping both to 'RBM' is
     what lets ScopeSelect's MANAGER_LEVELS check recognise them: without
     this, every ABM reporting to a "Sr." or "Deputy" RBM reads as having NO
     manager at all, and shows up as a false root in the Team scope tree
     instead of nesting under the real RBM, still well inside Sales. Found on
     UAT, not previously seen on ERP. */
  'Sr. Regional Business Manager': 'RBM',
  'Deputy Regional Business Manager': 'RBM',
  'Sales Manager': 'SM',
  'Zonal Sales Manager': 'ZSM',
  'General Manager': 'GM',
  /* Mapped for display (a CEO node showing up anywhere should read "CEO", not
     the raw title) but deliberately NOT in ScopeSelect's MANAGER_LEVELS --
     this screen is the SALES team report, and the CEO sits above Sales,
     Finance, IT and everything else the company runs. Making the CEO a
     selectable scope would put non-sales GMs one click away from equal
     footing with Sales, which is the opposite of what this screen is for.
     GM is the top of the tree on purpose: it is effectively "Sales" here. */
  'Chief Executive Officer': 'CEO',
};

export function shortDesignation(designation) {
  return DESIGNATION_SHORT[designation] ?? designation ?? '';
}

/* The sales management levels this screen's hierarchy is built from --
   everyone from an ABM up to whoever tops the field sales org, but never the
   CEO (see the comment on 'Chief Executive Officer' above). One export, used
   by both ScopeSelect (which levels are choosable scopes) and useVisitKpi
   (which level the screen defaults to when nothing is picked yet) -- two
   copies of this set is how they'd eventually disagree about what "Sales"
   means. */
export const MANAGER_LEVELS = new Set(['ABM', 'RBM', 'SM', 'ZSM', 'GM']);

/* The four attendance states, in the order they are stacked and legended.
   `working` first because it is the one you want to read at a glance. */
export const ATTENDANCE = ['working', 'notReporting', 'onLeave', 'vacant'];

/* REPORTED, not "working". A rep who logged a visit has REPORTED it; whether
   they were working is a thing this screen cannot know — it sees the log, not
   the day. "Not reported" says what is actually true (nothing has come in
   yet) instead of accusing somebody of not working because their phone had no
   signal at 9am.
 *
 * ABSENT, not "on leave". The chip's job is to account for a rep who filed
 * nothing, and "Absent" is the shorter word for it — it also stops the state
 * reading as a leave-calendar report, which it is not: over a range it means
 * "logged nothing, and was away for part of it" (see attendanceOf).
 *
 * THE KEYS STILL SAY `working` AND `onLeave`. They are the data layer's —
 * attendanceOf(), attendance(), rollupFor().workingReps — and renaming them
 * would touch every selector and its tests to change nothing a reader can
 * see. The words are here; the keys are plumbing. */
export const ATTENDANCE_LABEL = {
  working: 'Reported',
  notReporting: 'Not reported',
  onLeave: 'Absent',
  vacant: 'Vacant',
};

/* The heading on the drill-down each chip opens. Not `${ATTENDANCE_LABEL[k]}
   today` — "Vacant today" would describe an open seat as a thing that is
   true of this particular Tuesday, and a vacancy is not an attendance
   record. Same reason the sheet counts vacancies in seats, not people. */
export const ATTENDANCE_SHEET_TITLE = {
  working: 'Reported today',
  notReporting: 'Not reported today',
  onLeave: 'Absent today',
  vacant: 'Vacant seats',
};

/* The same headings when the card is counting a RANGE rather than a day.
   "today" comes off all three, because it would be a lie: over August these
   are the people who reported, or did not, or were away, at some point in
   August. Leave is windowed too — see attendanceOf.

   A vacancy is not an attendance record either way, so it never took the
   suffix and needs no second form. */
export function attendanceSheetTitle(state, overRange = false) {
  if (!overRange) return ATTENDANCE_SHEET_TITLE[state];
  return state === 'vacant' ? ATTENDANCE_SHEET_TITLE.vacant : ATTENDANCE_LABEL[state];
}

/* Tone per state. `notReporting` is danger and `onLeave` is warning, not the
   other way round: leave is planned and expected, a silent rep is not. */
export const ATTENDANCE_TONE = {
  working: 'success',
  notReporting: 'danger',
  onLeave: 'warning',
  vacant: 'neutral',
};

/* ---- THE SCREEN'S WORDS ------------------------------------------------
 *
 * Every user-facing word on /visit is fixed here or in a LABEL map above.
 * Two components inventing their own phrasing is how the same call ended up
 * pilled "Visited" on a card header and "Geo verified" on the attendee row
 * INSIDE THAT SAME CARD, under a legend that said "Geo-verified".
 *
 * THE TWO NOUNS. They are not synonyms and the distinction is load-bearing:
 *
 *   VISIT — one rep attending one doctor. The unit every KPI, bar, chart
 *           column and tree rollup counts.
 *   CALL  — one doctor meeting. A joint call is ONE call and TWO visits,
 *           which is why the drill-down sheets say "12 calls · 14 visits"
 *           rather than picking one and being wrong on 21% of the plan.
 *
 * Say "call" only where that distinction is actually being drawn, or in
 * `call average`, which is the industry's name for the metric and not ours
 * to rename.
 *
 * THE TWO VERBS. `planned` and `done` — never "happened", "completed",
 * "visited" or "achieved", which are four words for one state.
 *
 * CASE. Labels and titles are sentence case ("Visits done", "Force visit").
 * Captions under a figure are lower case ("no plan", "42% of plan"): they
 * finish the label's sentence rather than starting one.
 *
 * EMPTY STATES are "No <thing> <scope>." — one line, a full stop, no
 * apology and no "yet". */

/* The three states a visit can be in, and the only three words for them.
 *
 * A FORCE VISIT IS DONE. That is the distinction the red is teaching, and a
 * done/not-done pill would erase it — which is the whole reason this is a
 * three-state vocabulary and not a boolean. */
export const VISIT_STATUS = ['verified', 'force', 'pending'];

/* ONE WORD EACH. They were "Geo verified" and "Force visit", which is what a
   reader meeting them for the first time needs — but they are not met once:
   they are on every legend, every pill and every attendee row on the screen,
   several times per card. At that repetition the qualifier stops being read
   and only costs width, which is what pushed the legend into scrolling.
   Green means logged where it was meant to be; the screen teaches that once.

   Nothing that composes them may assume a short word — see VisitsByHourSheet,
   which now says "Force visits" by adding the noun rather than an "s". */
export const VISIT_STATUS_LABEL = {
  verified: 'Geo',
  force: 'Force',
  pending: 'Pending',
};

export const VISIT_STATUS_TONE = {
  verified: 'success',
  force: 'danger',
  pending: 'neutral',
};
