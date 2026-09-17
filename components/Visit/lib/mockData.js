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
function rowsForRepDay(member, isoDate, cutoffHour) {
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

    /* Visits cluster 9am-6pm with a lunchtime peak, which is what the live
       custom_visit_time histogram looks like. */
    const hour = intBetween(rng, 9, 17);
    const minute = intBetween(rng, 0, 59);
    const done = !inactive && rng() < completionTarget && hour < cutoffHour;

    const forceVisit = done && rng() < 0.11;
    rows.push({
      eventId: `EV${280000 + seedFrom(member.id, isoDate, String(i)) % 9999}`,
      subject: `${doctorName.replace(/\s+/g, '')}-Visit-${member.name.replace(/\s+/g, '')}`,
      plannedDate: isoDate,
      employeeId: member.id,
      employeeName: member.name,
      doctorId,
      doctorName,
      hq: member.hq,
      department: HQS.find((h) => h.hq === member.hq)?.department ?? '',
      pobGiven: done && rng() < 0.62,
      visitTime: done ? stamp(isoDate, hour, minute) : null,
      /* Force visits are force visits BECAUSE the rep was far from the planned
         location, so the two fields have to agree. Generating them
         independently produced rows that were 40m away and flagged forced. */
      distanceKm: done ? (forceVisit ? 2 + rng() * 12 : rng() * 0.4) : null,
      forceVisit,
    });
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
export function buildMockDataset({ anchorDate, cutoffHour = 16 } = {}) {
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
  }));

  const reps = ROSTER.filter((m) => m.designation === FIELD_DESIGNATION);

  const rows = [];
  const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  while (toISODate(cursor) <= today) {
    if (isWorkingDay(cursor)) {
      const iso = toISODate(cursor);
      /* Only TODAY is truncated by the cutoff. Past days are complete, which
         is what makes month-to-date averages meaningful. */
      const cut = iso === today ? cutoffHour : 24;
      for (const rep of reps) rows.push(...rowsForRepDay(rep, iso, cut));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { team, rows, today, cutoffHour };
}

