/* THE TEAM TREE BY SEAT. Pure.
 *
 * Who sits under whom is the Role Profile tree (`parent_role_profile`) and
 * nothing else — Employee.reports_to is not read: a member's manager is
 * whoever holds the seat above theirs, up to the holder of the Sales root
 * itself (the GM). A member on no Sales seat hangs from no one.
 *
 * A SEAT NO ONE HOLDS IS A MEMBER TOO: vacant, named by its seat, its id the
 * seat itself. Without it the people under an empty ABM seat would have no
 * row to hang from.
 *
 * A SEAT HELD BY MORE THAN ONE REAL PERSON: its seats below hang from one of
 * them (a real person before a vacant placeholder), and every other real
 * holder carries `sharesSeatWith` — that one's id — so the tree, the scope
 * picker and the counts give each of them the whole team below the seat
 * (see kidsOf in selectors.js).
 *
 * `roles`: { parentOf: Map(seat → parent seat), under: Set(seats under the
 * Sales root) }. Without them the team is returned as it came. */

export const SALES_ROLE_ROOT = 'Sales';

const DESIGNATION_OF_TIER = {
  BE: 'Business Executive',
  ABM: 'Area Business Manager',
  RBM: 'Regional Business Manager',
  SRBM: 'Regional Business Manager',
  SM: 'Sales Manager',
  ZSM: 'Zonal Sales Manager',
  GM: 'General Manager',
};

/* "ABM2-AURA-RA-JOD" → "ABM". */
export function seatTier(seat) {
  return String(seat ?? '')
    .split('-')[0]
    .replace(/\d+$/, '')
    .toUpperCase();
}

export function treeBySeat(team, roles) {
  const parentOf = roles?.parentOf;
  const under = roles?.under;
  if (!parentOf || !under) return team;

  const holder = new Map();
  for (const m of team) {
    const seat = m.roleProfile;
    if (!seat || !under.has(seat)) continue;
    const cur = holder.get(seat);
    if (!cur || (cur.vacant && !m.vacant)) holder.set(seat, m);
  }
  const nodeOf = (seat) => holder.get(seat)?.id ?? seat;
  const parentNode = (seat) => {
    const p = parentOf.get(seat);
    return p && under.has(p) ? nodeOf(p) : null;
  };

  const out = team.map((m) => {
    const seat = m.roleProfile && under.has(m.roleProfile) ? m.roleProfile : null;
    const first = seat ? holder.get(seat) : null;
    const twin = first && first.id !== m.id && !m.vacant ? { sharesSeatWith: first.id } : {};
    return { ...m, reportsTo: seat ? parentNode(seat) : null, ...twin };
  });
  for (const seat of under) {
    if (seat === SALES_ROLE_ROOT || holder.has(seat)) continue;
    const short = seatTier(seat);
    const designation = DESIGNATION_OF_TIER[short];
    if (!designation) continue;
    out.push({
      id: seat,
      name: seat,
      designation,
      short,
      reportsTo: parentNode(seat),
      hq: '',
      vacant: true,
      onLeave: false,
      userId: null,
      roleProfile: seat,
      seatOnly: true,
    });
  }
  return out;
}
