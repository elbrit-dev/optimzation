/* Mock dataset for the Team Report screen.
 *
 * WHY THIS EXISTS AND NOT A HARDCODED SET OF NUMBERS
 * The reference dashboard this screen is modelled on hardcodes its totals, so
 * its cards cannot disagree with its tree — and cannot be wrong either. Here
 * the numbers are COMPUTED from rows by the same selectors the live data will
 * run through, so the mock exercises the real aggregation path. If
 * `visitsByHour` has an off-by-one, this mock will show it.
 *
 * DETERMINISM
 * A seeded LCG, not Math.random. Two calls with the same anchor date produce
 * byte-identical rows, which is what makes a Playwright screenshot baseline
 * possible at all. Never introduce Date.now() or Math.random() below.
 *
 * FIDELITY TO THE REAL DATA
 * Names, HQs, departments and the BE/ABM/RBM/SM ladder are taken from the live
 * ERPNext instance (see PLAN.md §2). Volumes are tuned to the real
 * distribution: ~12 planned calls per BE per day, ~70% completion by 4pm,
 * ~10% force visits, ~60% POB given.
 */

import { shortDesignation } from './shape';
import { monthEnd } from './selectors';

/* ---- Deterministic pseudo-randomness -------------------------------- */

/* Numerical Recipes LCG. Fast, seedable, and more than random enough for
   fixture data — do not reach for a real PRNG here. */
function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/* A stable seed per (string, day) so the same rep on the same date always
   gets the same day, but a different one tomorrow. */
function seedFrom(...parts) {
  const s = parts.join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* ---- Roster ---------------------------------------------------------- */

const HQS = [
  { hq: 'HQ-Hubballi', department: 'Elbrit Karnataka - ELPL' },
  { hq: 'HQ-Hyderabad', department: 'Elbrit Telangana - ELPL' },
  { hq: 'HQ-Erode', department: 'Elbrit Coimbatore - ELPL' },
];

/* One SM, two RBMs, their ABMs and BEs. Deliberately NOT the whole 400-person
   org: the screen only ever renders one manager's subtree, and a fixture that
   is bigger than the view is a fixture nobody reads. */
const ROSTER = [
  { id: 'E00301', name: 'Santosh Kumar', designation: 'Sales Manager', reportsTo: null, hq: 'HQ-Hubballi' },

  { id: 'E00412', name: 'Bishnu Charan Behera', designation: 'Regional Business Manager', reportsTo: 'E00301', hq: 'HQ-Hubballi' },
  { id: 'E00566', name: 'Mohammed Tousif', designation: 'Area Business Manager', reportsTo: 'E00412', hq: 'HQ-Hubballi' },
  { id: 'E01102', name: 'Shankrappa Mannur', designation: 'Business Executive', reportsTo: 'E00566', hq: 'HQ-Hubballi' },
  { id: 'E01103', name: 'Majeed Khan H', designation: 'Business Executive', reportsTo: 'E00566', hq: 'HQ-Hubballi' },
  { id: 'E01104', name: 'Moin Mohmed Paniwale', designation: 'Business Executive', reportsTo: 'E00566', hq: 'HQ-Hubballi' },
  { id: 'E00571', name: 'Niteesh Kumar Pal', designation: 'Area Business Manager', reportsTo: 'E00412', hq: 'HQ-Hubballi' },
  { id: 'E01108', name: 'Mahammed Waseem Basha', designation: 'Business Executive', reportsTo: 'E00571', hq: 'HQ-Hubballi' },
  { id: 'E01109', name: 'Atul Yadav', designation: 'Business Executive', reportsTo: 'E00571', hq: 'HQ-Hubballi' },
  { id: 'E01110', name: 'Rishu Gupta', designation: 'Business Executive', reportsTo: 'E00571', hq: 'HQ-Hubballi', vacant: true },
  { id: 'E00577', name: 'Arunkumar M', designation: 'Area Business Manager', reportsTo: 'E00412', hq: 'HQ-Hubballi' },
  { id: 'E01115', name: 'Umesh A M', designation: 'Business Executive', reportsTo: 'E00577', hq: 'HQ-Hubballi' },
  { id: 'E01116', name: 'Deekshith', designation: 'Business Executive', reportsTo: 'E00577', hq: 'HQ-Hubballi' },
  { id: 'E01117', name: 'Mayur Yuvaraj Mohite', designation: 'Business Executive', reportsTo: 'E00577', hq: 'HQ-Hubballi' },
  { id: 'E01118', name: 'Chandrashekar V', designation: 'Business Executive', reportsTo: 'E00577', hq: 'HQ-Hubballi', silent: true },
  { id: 'E00583', name: 'Premchand Sahani', designation: 'Area Business Manager', reportsTo: 'E00412', hq: 'HQ-Erode' },
  { id: 'E01122', name: 'Amit Kumar Thakur', designation: 'Business Executive', reportsTo: 'E00583', hq: 'HQ-Erode' },
  { id: 'E01123', name: 'Sachin Yadav', designation: 'Business Executive', reportsTo: 'E00583', hq: 'HQ-Erode' },
  { id: 'E01124', name: 'Fayaque Ahmed Qazi', designation: 'Business Executive', reportsTo: 'E00583', hq: 'HQ-Erode', onLeave: true },

  { id: 'E00424', name: 'Medisemmy Anil Kumar', designation: 'Regional Business Manager', reportsTo: 'E00301', hq: 'HQ-Hyderabad' },
  { id: 'E00591', name: 'Dupati Harish', designation: 'Area Business Manager', reportsTo: 'E00424', hq: 'HQ-Hyderabad' },
  { id: 'E01131', name: 'Seelamsetti Laxmaiah', designation: 'Business Executive', reportsTo: 'E00591', hq: 'HQ-Hyderabad', vacant: true },
  { id: 'E01132', name: 'Mallepakula Balaswamy', designation: 'Business Executive', reportsTo: 'E00591', hq: 'HQ-Hyderabad' },
  { id: 'E01133', name: 'Boinapally Shiva Kumar', designation: 'Business Executive', reportsTo: 'E00591', hq: 'HQ-Hyderabad' },
  { id: 'E00596', name: 'Nagunoori Anil Kumar', designation: 'Area Business Manager', reportsTo: 'E00424', hq: 'HQ-Hyderabad' },
  { id: 'E01137', name: 'Jangili Vamshikrishna', designation: 'Business Executive', reportsTo: 'E00596', hq: 'HQ-Hyderabad' },
  { id: 'E01138', name: 'Srikanth V', designation: 'Business Executive', reportsTo: 'E00596', hq: 'HQ-Hyderabad' },
  { id: 'E01139', name: 'Kukatla Rakesh', designation: 'Business Executive', reportsTo: 'E00596', hq: 'HQ-Hyderabad' },
  { id: 'E00602', name: 'Kasturi Sridhar', designation: 'Area Business Manager', reportsTo: 'E00424', hq: 'HQ-Hyderabad' },
  { id: 'E01143', name: 'Mamidala Raghavendra Satya', designation: 'Business Executive', reportsTo: 'E00602', hq: 'HQ-Hyderabad' },
  { id: 'E01144', name: 'Sangeeta Virbhadra Dumane', designation: 'Business Executive', reportsTo: 'E00602', hq: 'HQ-Hyderabad' },
  { id: 'E01145', name: 'Sarvi Ashok', designation: 'Business Executive', reportsTo: 'E00602', hq: 'HQ-Hyderabad', vacant: true },
];

const DOCTORS = [
  'Dr A S Senthil Velu', 'Dr Balakrishnan S', 'Dr Chandramouli', 'Dr P Saravanakumar',
  'Dr Sivaraman', 'Dr Vasanthi Rajesh', 'Dr Vijaya Baskar', 'Dr Anurag Bajpayee',
  'Dr P D Tripathi', 'Dr Meera Nair', 'Dr Rakesh Gupta', 'Dr S Lakshmi',
  'Dr Imran Sheikh', 'Dr Ananya Rao', 'Dr K Venkatesh', 'Dr Neha Kulkarni',
];

/* What reps actually type into custom_force_visit_reason. The empty string is
   in the list on purpose and not as an oversight: the field is not mandatory,
   a good share of forced calls carry no reason at all, and the sheet has to
   look right for those too. */
const FORCE_VISIT_REASONS = [
  'Doctor shifted to another clinic for the day',
  'Met at the hospital OP block instead of the clinic',
  'Camp duty at a nearby PHC',
  'Clinic closed, met at the doctor’s residence',
  'Poor GPS accuracy inside the hospital building',
  '',
];

/* Real values from the live Specialty list. Mixed case is theirs, not a typo
   -- the badge uppercases for display. '' is real: not every doctor has one. */
const DOCTOR_SPECIALTIES = [
  'CARDIO', 'ORTHO', 'GP', 'CP', 'NEURO', 'Diabeto', 'GYNAE', 'PHYSICIAN',
  'Chest Phy', 'NEPHRO', '',
];

/* A doctor carries up to FOUR category links, and the live data uses them as
   four different scales: a commercial grade, a value/reach band, a focus
   bucket, and sometimes a campaign. Modelled as four pools so the fixture
   produces the same SHAPE as live ("C · LILR · EC10"), not four values drawn
   from one bag. Each is independently optional, which is why the card has to
   cope with one tag, four, or none. */
const DOCTOR_CATEGORY_POOLS = [
  ['C', 'SC', 'E', ''],
  ['LILR', 'LIHR', 'HILR', 'HIHR', ''],
  ['EC10', 'EC20', 'C20', 'AEC10', ''],
  ['A&P FOCUS 20', 'KA E FOCUS 20', '', '', ''],
];

const DOCTOR_CITIES = [
  'Gobi', 'Marthandam', 'Hubballi', 'Erode', 'Hyderabad', 'Davangere',
  'Bhatkal', 'Nagercoil', 'Tiruppur', '',
];

/* ---- Date helpers ---------------------------------------------------- */

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stamp(isoDate, hour, minute) {
  return `${isoDate} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

/* Sunday off. Six-day week is what the field force actually works, and a
   Monday-to-Friday mock makes "25 working days" in the MTD header a lie. */
function isWorkingDay(d) {
  return d.getDay() !== 0;
}

/* ---- Row generation -------------------------------------------------- */

const FIELD_DESIGNATION = 'Business Executive';

/* One rep, one day. `cutoffHour` is what makes "as of 4:00 PM" real: visits
   after it simply have not happened yet, so the afternoon bars taper the way
   a live dashboard does instead of showing a full day at 10am. */
/* ROUGHLY A FIFTH OF CALLS ARE JOINT, because that is what the live data
   holds: of 400 September events, 315 carried one participant, 84 carried two
   and one carried three. An earlier version of this fixture emitted one
   participant per event on the strength of three sampled records -- which
   turned out to be the wrong event category entirely -- and so never
   exercised the grouping the drill-down sheet is built on.

   The manager is the second attendee, because that is what a joint call is:
   somebody going along with somebody else.

   NOTE this reproduces production's row inflation, deliberately. Both rows
   carry the REP's employeeId (it is the Event's field), so a joint call
   counts twice in planned/happened -- see shape.js. A fixture that quietly
   avoided that would make the mock disagree with live on exactly the numbers
   people check the mock against. */
function rowsForRepDay(member, isoDate, cutoffHour, manager) {
  const rng = makeRng(seedFrom(member.id, isoDate));
  const planned = intBetween(rng, 9, 16);

  /* Two shapes of absence, and they are not the same thing. A vacant seat has
     no plan at all -- nobody made one. A rep who is on leave or silent HAS a
     plan they did not execute, and the gap between plan and zero is exactly
     what the dashboard is for. */
  if (member.vacant) return [];

  const inactive = member.onLeave || member.silent;
  const completionTarget = inactive ? 0 : 0.55 + rng() * 0.35;

  const rows = [];
  for (let i = 0; i < planned; i += 1) {
    const doctorName = pick(rng, DOCTORS);
    const doctorId = `DR-${79000 + Math.floor(rng() * 900)}`;
    /* Keyed off the doctor id, not the call: a doctor's town and grade belong
       to the doctor, so the same DR- code must not change city between two
       visits in the same list. */
    const doctorSeed = seedFrom(doctorId);
    const doctorCity = DOCTOR_CITIES[doctorSeed % DOCTOR_CITIES.length];
    const doctorSpecialty = DOCTOR_SPECIALTIES[doctorSeed % DOCTOR_SPECIALTIES.length];
    /* Each pool offset by the slot index so the four do not move in lockstep
       off one seed -- otherwise every doctor lands on the same row of every
       pool and the fixture only ever shows two of the combinations. */
    const doctorCategories = DOCTOR_CATEGORY_POOLS
      .map((pool, slot) => pool[seedFrom(doctorId, String(slot)) % pool.length])
      .filter(Boolean);

    /* Visits cluster 9am-6pm with a lunchtime peak, which is what the live
       custom_visit_time histogram looks like. */
    const hour = intBetween(rng, 9, 17);
    const minute = intBetween(rng, 0, 59);
    const done = !inactive && rng() < completionTarget && hour < cutoffHour;

    const forceVisit = done && rng() < 0.11;
    /* Decided before the row is built so both attendees share the event id,
       which is what groupByEvent rejoins them on. */
    const joint = Boolean(manager) && rng() < 0.21;
    const eventId =`EV${280000 + seedFrom(member.id, isoDate, String(i)) % 9999}`;

    rows.push({
      eventId,
      subject: `${doctorName.replace(/\s+/g, '')}-Visit-${member.name.replace(/\s+/g, '')}`,
      plannedDate: isoDate,
      employeeId: member.id,
      employeeName: member.name,
      /* Same person as employeeId on a solo call; they part company on the
         manager's row below, exactly as they do live. */
      planOwnerId: member.id,
      doctorId,
      doctorName,
      doctorCity,
      doctorSpecialty,
      doctorCategories,
      hq: member.hq,
      department: HQS.find((h) => h.hq === member.hq)?.department ?? '',
      pobGiven: done && rng() < 0.62,
      visitTime: done ? stamp(isoDate, hour, minute) : null,
      /* Force visits are force visits BECAUSE the rep was far from the planned
         location, so the two fields have to agree. Generating them
         independently produced rows that were 40m away and flagged forced. */
      distanceKm: done ? (forceVisit ? 2 + rng() * 12 : rng() * 0.4) : null,
      forceVisit,
      /* Only a forced call has one, same as the live rows. */
      forceVisitReason: forceVisit ? pick(rng, FORCE_VISIT_REASONS) : '',
      participantRef: member.id,
      participantRefType: 'Employee',
      participantId: member.id,
      participantName: member.name,
      /* One now, corrected to 2 below if this call turns out to be joint --
         both rows of one event have to carry the same count, or the bar
         would report the rep's half as solo and the manager's as joint. */
      participantCount: 1,
    });

    /* The manager's participant row on the SAME event. Same plan, same
       doctor, same employeeId -- what differs is the person and the half of
       the record that belongs to them: they arrive at their own time and
       geo-verify or force independently of the rep beside them.

       That independence is the whole point of the expandable table. A joint
       call where the rep was at the clinic and the manager logged from the
       car park is two different facts under one doctor's name. */
    if (joint) {
      const mgrForce = done && rng() < 0.2;
      rows.push({
        ...rows[rows.length - 1],
        visitTime: done ? stamp(isoDate, hour, intBetween(rng, 0, 59)) : null,
        distanceKm: done ? (mgrForce ? 2 + rng() * 12 : rng() * 0.4) : null,
        forceVisit: mgrForce,
        forceVisitReason: mgrForce ? pick(rng, FORCE_VISIT_REASONS) : '',
        /* Attributed to the MANAGER, while planOwnerId stays the rep's --
           inherited untouched from the spread above. That is the whole fix:
           one call, two people, one planned visit each, and the plan still
           belongs to the rep. */
        employeeId: manager.id,
        employeeName: manager.name,
        participantRef: manager.id,
        participantId: manager.id,
        participantName: manager.name,
        participantCount: 2,
      });
      /* The rep's row belongs to the same event, so it says 2 as well. */
      rows[rows.length - 2].participantCount = 2;
    }
  }
  return rows;
}

/* ---- Public API ------------------------------------------------------ */

/* Returns the whole fixture: the roster plus every visit row for the calendar
   month up to `anchorDate`. Filtering to a period or a subtree is the caller's
   job -- see selectors.js -- because that is exactly what the live source will
   hand back too.
 *
 * `cutoffHour` is the "as of" clock. Default 16 matches the reference
 * screenshot's 4:00 PM. */
export function buildMockDataset({ anchorDate, cutoffHour = 16, month, monthTo } = {}) {
  /* Rolls back to the last working day when none is given. The field force
     does not work Sundays, so a real Sunday produces a real screen of zeroes —
     correct, and a useless thing to look at while building. A caller that
     passes an explicit anchorDate gets exactly that date, zeroes and all. */
  const anchor = anchorDate ? new Date(anchorDate) : new Date();
  if (!anchorDate) {
    while (!isWorkingDay(anchor)) anchor.setDate(anchor.getDate() - 1);
  }
  const today = toISODate(anchor);

  const team = ROSTER.map((m) => ({
    id: m.id,
    name: m.name,
    designation: m.designation,
    short: shortDesignation(m.designation),
    reportsTo: m.reportsTo,
    hq: m.hq,
    vacant: Boolean(m.vacant),
    onLeave: Boolean(m.onLeave),
    /* The fixture has no leave calendar to overlap a window against, so the
       two flags are the same value here -- attendanceOf falls back to this
       one anyway when the windowed flag is absent. */
    onLeaveInWindow: Boolean(m.onLeave),
    /* One open-ended spell, so the Absent drill-down has something shaped
       like the live data to draw. The fixture has no leave calendar of its
       own; what matters here is the SHAPE — a range and a type — because
       that is what leaveDaysOf cuts against the window. */
    leave: m.onLeave ? [{ from: '1970-01-01', to: '2999-12-31', type: 'Casual Leave' }] : [],
    /* null, like the 65 live employees who have no profile set. The fixture
       is the sales ladder end to end, so there is nothing here for the Sales
       narrowing to remove -- it is the live roster that carries CRM, Accounts
       and HR alongside the field force. */
    roleProfile: null,
  }));

  const reps = ROSTER.filter((m) => m.designation === FIELD_DESIGNATION);

  const rows = [];
  const addDay = (iso) => {
    /* Only TODAY is truncated by the cutoff. Past days are complete, which
       is what makes a month average meaningful. */
    const cut = iso === today ? cutoffHour : 24;
    for (const rep of reps) {
      rows.push(...rowsForRepDay(rep, iso, cut, ROSTER.find((m) => m.id === rep.reportsTo)));
    }
  };

  /* Mirrors the live source's window exactly, including the second pass
     for today when the picked month is a past one -- attendance reads
     today's rows whatever period is showing, so a fixture that omits them
     would make the mock disagree with live on the one card that is never
     period-scoped. */
  const firstMonth = month ?? today.slice(0, 7);
  const lastMonth = monthTo ?? firstMonth;
  const selectedEnd = monthEnd(lastMonth);
  const windowTo = selectedEnd < today ? selectedEnd : today;
  const [y, m] = firstMonth.split('-').map(Number);

  const cursor = new Date(y, m - 1, 1);
  while (toISODate(cursor) <= windowTo) {
    if (isWorkingDay(cursor)) addDay(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if ((today < `${firstMonth}-01` || today > windowTo) && isWorkingDay(anchor)) addDay(today);

  /* The fixture is generated, so it is never short of rows -- but it has
     to carry the field, or the screen would read `undefined` from the
     mock and `false` from live for the same state. */
  return { team, rows, today, cutoffHour, truncated: false };
}

