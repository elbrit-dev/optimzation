import { STATUSES } from './shape';

/* Every number on the screen, pure. Entries come from shape.normalizeEntries. */

/* "Entered" is what the header counts: a seat that has submitted, whatever
   happened after. A rejection is back on the seat's plate, so it is not. */
export function isEntered(entry) {
  return entry.status === 'pending' || entry.status === 'approved';
}

export function countByStatus(entries) {
  const counts = { all: entries.length };
  for (const s of STATUSES) counts[s] = 0;
  for (const e of entries) counts[e.status] += 1;
  return counts;
}

export function progress(entries) {
  const entered = entries.filter(isEntered).length;
  return { entered, total: entries.length, remaining: entries.length - entered };
}

/* The Draft / Pending / Approved grid: qty and value for sales and closing. */
export function statusMatrix(entries) {
  const blank = () => ({ qty: 0, value: 0 });
  const matrix = {};
  for (const s of STATUSES) matrix[s] = { sales: blank(), closing: blank() };
  for (const e of entries) {
    const cell = matrix[e.status];
    cell.sales.qty += e.salesQty;
    cell.sales.value += e.salesValue;
    cell.closing.qty += e.closingQty;
    cell.closing.value += e.closingValue;
  }
  return matrix;
}

export function filterByStatus(entries, status) {
  if (!status || status === 'all') return entries;
  return entries.filter((e) => e.status === status);
}

/* Whether an entry can go for approval in bulk: still the seat's to send
   (draft, or sent back) AND something is filled in. An entry with no
   quantities is a blank submission — the approver would only send it back. */
export function canSubmit(entry) {
  if (entry.status !== 'draft' && entry.status !== 'rejected' && entry.status !== 'revisit') return false;
  return entry.lines.some((l) => l.salesQty > 0 || l.closingQty > 0);
}

/* Why an entry cannot be picked for a bulk send, in the words its card
   shows; null when it can. */
export function submitBlocker(entry) {
  if (entry.status === 'pending') return 'Already with approvers';
  if (entry.status === 'approved') return 'Already approved';
  if (!entry.lines.some((l) => l.salesQty > 0 || l.closingQty > 0)) return 'Nothing filled yet';
  return null;
}

/* Draft, rejected and sent-back-for-revisit stockists are the ones still to
   fill. */
export function pendingForSeat(entries) {
  return entries.filter((e) => e.status === 'draft' || e.status === 'rejected' || e.status === 'revisit');
}

/* The month most entries are for — the period the header talks about. */
export function dominantMonth(entries) {
  const tally = new Map();
  for (const e of entries) if (e.month) tally.set(e.month, (tally.get(e.month) ?? 0) + 1);
  let best = null;
  for (const [month, n] of tally) if (!best || n > best.n || (n === best.n && month > best.month)) best = { month, n };
  return best?.month ?? null;
}

/* Products the form can offer: the Items query when it has loaded, otherwise
   every item already seen on any entry, so "+ Add product" is never empty. */
export function productOptions(products, entries) {
  if (products?.length) return products;
  const seen = new Map();
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.item && !seen.has(l.item)) {
        seen.set(l.item, {
          item: l.item,
          label: l.item,
          brand: l.item,
          pack: l.pack,
          price: l.price,
          row: { item_name: l.item, custom_last_pts: l.price || null },
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/* Products grouped for the picker: one group per brand, variants inside,
   narrowed by a search over brand and item and by the added/not-added
   filter. Brands keep their order; a brand with no surviving variant goes. */
export function productGroups(products, { query = '', filter = 'all', added = new Set() } = {}) {
  const q = query.trim().toLowerCase();
  const groups = new Map();
  for (const p of products) {
    const isAdded = added.has(p.item);
    if (filter === 'added' && !isAdded) continue;
    if (filter === 'notAdded' && isAdded) continue;
    if (q && !`${p.brand} ${p.label} ${p.item}`.toLowerCase().includes(q)) continue;
    if (!groups.has(p.brand)) groups.set(p.brand, []);
    groups.get(p.brand).push(p);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brand, items]) => ({ brand, items }));
}

export function entryValue(lines) {
  return lines.reduce((acc, l) => acc + (Number(l.salesQty) || 0) * (Number(l.price) || 0), 0);
}
