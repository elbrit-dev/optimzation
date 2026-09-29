/* The team tree — the members elbrit_entry_team sends, as a tree. Pure.
 *
 * A member is one Employee: { id, name, seat, tier, reportsTo, vacant, user,
 * approved, waiting, todo, total } — their seat's month, counted as Ring Nav
 * counts an entry tile. A manager's own seat rarely has records of its own,
 * so a row shows its WHOLE BRANCH (rollup): an RBM's bar is every ABM's and
 * BE's under them, which is what "how is my team doing" asks.
 *
 * DEAD-END VACANCIES ARE DROPPED, as in Visit's team tree: a vacant seat
 * with nobody under it and nothing to enter says nothing. One with reports
 * stays — dropping it would orphan the people under it. */

export function teamIndex(members = []) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const kids = new Map();
  for (const m of members) {
    if (!m.reportsTo || !byId.has(m.reportsTo) || m.reportsTo === m.id) continue;
    if (!kids.has(m.reportsTo)) kids.set(m.reportsTo, []);
    kids.get(m.reportsTo).push(m);
  }
  const order = (a, b) => rank(a.tier) - rank(b.tier) || String(a.name).localeCompare(String(b.name));
  for (const list of kids.values()) list.sort(order);

  /* Visible: not a dead-end vacancy, looked at from the leaves up. */
  const visible = new Map();
  const isVisible = (m) => {
    if (visible.has(m.id)) return visible.get(m.id);
    visible.set(m.id, true);
    const shown = (kids.get(m.id) ?? []).some(isVisible);
    const v = !m.vacant || shown || m.total > 0;
    visible.set(m.id, v);
    return v;
  };
  members.forEach(isVisible);

  const children = (id) => (kids.get(id) ?? []).filter((m) => visible.get(m.id));

  /* A branch's month: the member's own and everyone's under them. */
  const rolled = new Map();
  const rollup = (m) => {
    if (rolled.has(m.id)) return rolled.get(m.id);
    const r = { approved: m.approved || 0, waiting: m.waiting || 0, todo: m.todo || 0, total: m.total || 0, people: m.seat && !m.vacant && m.total > 0 ? 1 : 0, done: 0 };
    if (r.people && m.todo === 0 && m.waiting === 0) r.done = 1;
    rolled.set(m.id, r);
    for (const k of children(m.id)) {
      const c = rollup(k);
      r.approved += c.approved;
      r.waiting += c.waiting;
      r.todo += c.todo;
      r.total += c.total;
      r.people += c.people;
      r.done += c.done;
    }
    return r;
  };

  return { byId, children, rollup, isVisible: (m) => visible.get(m.id) };
}

/* The rows at the top: the caller's reports (the caller themselves is the
   screen's own subject), or — with no root, for IT — everyone whose manager
   is not in the list. */
export function teamTops(members = [], root, index = teamIndex(members)) {
  if (root && index.byId.has(root)) return index.children(root);
  return members
    .filter((m) => !m.reportsTo || !index.byId.has(m.reportsTo))
    .filter((m) => index.isVisible(m))
    .sort((a, b) => rank(a.tier) - rank(b.tier) || String(a.name).localeCompare(String(b.name)));
}

/* Has the caller a team at all — anyone under them (IT: anyone). */
export function hasTeam(data) {
  if (!Array.isArray(data?.members) || !data.members.length) return false;
  return data.root ? data.members.some((m) => m.reportsTo === data.root) : true;
}

const TIERS = ['GM', 'SM', 'ZSM', 'SRBM', 'RBM', 'ABM', 'BE'];
function rank(tier) {
  const i = TIERS.indexOf(String(tier ?? '').toUpperCase());
  return i < 0 ? TIERS.length : i;
}
