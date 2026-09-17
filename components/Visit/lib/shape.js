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
 *   Event.custom_hq__name                   -> hq
 *   Event.custom_pob_given                  -> pobGiven
 *   participant.custom_visit_time           -> visitTime     (null = not done)
 *   participant.custom_distance             -> distanceKm
 *   participant.custom_is_force_visit       -> forceVisit
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
 * @property {string}      hq
 * @property {string}      department
 * @property {boolean}     pobGiven
 * @property {string|null} visitTime     'YYYY-MM-DD HH:mm:ss', or null
 * @property {number|null} distanceKm
 * @property {boolean}     forceVisit
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
 * @property {boolean}     onLeave
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

export const ATTENDANCE_LABEL = {
  working: 'Working',
  notReporting: 'Not reporting',
  onLeave: 'On leave',
  vacant: 'Vacant',
};

/* Tone per state. `notReporting` is danger and `onLeave` is warning, not the
   other way round: leave is planned and expected, a silent rep is not. */
export const ATTENDANCE_TONE = {
  working: 'success',
  notReporting: 'danger',
  onLeave: 'warning',
  vacant: 'neutral',
};
