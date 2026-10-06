/**
 * How senior is the reader — as a NUMBER.
 *
 * A leaf module on purpose. `erp.js` needs this to decide the service gate and
 * `scope.js` needs it too; if either owned it the two would import each other.
 *
 * WHY A RANK AND NOT A LIST OF SEAT CODES. The rule this replaced was
 * `["SM", "ZSM", "Admin"].includes(prefix)`, and a prefix list can only ever
 * match the codes whoever wrote it happened to think of. It was wrong for real
 * people on both sides of the line.
 *
 * WHY THE GRADE IS READ TWICE. The seat code and the HR designation disagree,
 * and each is the only correct signal in some cases:
 *
 *   E00181  seat SRBM-ELBR-KE-COC, designation "Sales Manager". He reports
 *           straight to a ZSM with RBMs under him, so he IS an SM — but "SRBM"
 *           is not "SM" and the seat code alone ranks him below one.
 *   E00003  seat "IT", designation "General Manager". The seat carries no grade
 *           at all; only the designation knows.
 *   E00010  seat SM-ELB_AURA_KA, designation "Zonal Sales Manager". Both agree.
 *
 * The HIGHER of the two wins. Under-ranking a manager silently empties the page
 * for someone entitled to it, and both inputs are maintained by HR — neither is
 * something a reader could edit to grant themselves sight.
 */

const SEAT_RANK = {
  BE: 1, TL: 1, KAM: 1,
  ABM: 2,
  RBM: 3,
  SRBM: 4,
  SM: 5, ZSM: 5,
  GM: 8,
  // IT sits with the other head-office seats deliberately. It used to be absent,
  // which ranked a plain "IT" seat at 0 -- the same as no seat at all -- so an IT
  // holder got an empty doctor page unless their HR designation happened to say
  // "General Manager" (which is how E00003 scraped through, see above). Note what
  // rank 9 carries with it: it is >= SERVICE_MIN_RANK, so these seats also see
  // service and ROI figures. That is intended for head office; it is the reason
  // this list is a deliberate roster and not a catch-all.
  IT: 9,
  CEO: 9, ADMIN: 9, MIS: 9,
};

const DESIGNATION_RANK = [
  [/chief executive|managing director/i, 9],
  [/\bgeneral manager\b|deputy gm/i, 8],
  [/zonal sales manager/i, 5],
  [/\bsales manager\b/i, 5],
  [/senior regional|deputy rbm/i, 4],
  [/regional business manager/i, 3],
  [/area business manager/i, 2],
  [/business executive|team lead/i, 1],
];

/**
 * "BE12-CND-CH-CHE" -> "BE".
 *
 * Digits belong to the seat NUMBER, not the grade — BE12 and BE1 are both BEs,
 * and "SM1" is still an SM.
 */
export function seatPrefix(roleId) {
  if (!roleId) return null;
  const prefix = String(roleId).split("-")[0].replace(/[0-9]/g, "").toUpperCase();
  return prefix || null;
}

export function gradeRank({ roleId, designation } = {}) {
  const bySeat = SEAT_RANK[seatPrefix(roleId)] ?? 0;
  const text = String(designation ?? "");
  let byTitle = 0;
  for (const [pattern, rank] of DESIGNATION_RANK) {
    if (pattern.test(text)) { byTitle = rank; break; }
  }
  return Math.max(bySeat, byTitle);
}

/**
 * The grade at which what the company SPENT on a doctor becomes visible.
 *
 * "Till SM the service should not be visible": a BE, an ABM and an RBM see
 * support, POB and visits but never the service figures; an SM and everyone
 * above them does. An unresolved reader ranks 0 and is refused.
 */
export const SERVICE_MIN_RANK = 5;

/**
 * At or above this grade the reader is not IN the sales hierarchy, they oversee
 * it, so their view of a doctor is the WHOLE doctor -- every division, every HQ,
 * every seat -- rather than their own subtree.
 *
 * 8 rather than 9 so that GM is included alongside CEO / Admin / MIS / IT.
 *
 * This is read from the viewer's OWN ERP row and from nothing else. It must never
 * be driven by the `roleProfile` prop: that one is documented to only ever take
 * away, and letting it grant this instead would turn a Studio field into a
 * privilege escalation.
 */
export const ADMIN_MIN_RANK = 8;
