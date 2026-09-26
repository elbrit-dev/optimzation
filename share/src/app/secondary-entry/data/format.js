/* Every string on the screen, pure. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const qtyFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const moneyFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/* "HQ-Nagercoil" → "Nagercoil": the prefix is on every territory, so it
   says nothing on a card that already shows a pin. */
export function hqLabel(hq) {
  return String(hq ?? '').replace(/^HQ[-\s]*/i, '').trim();
}

export function formatQty(n) {
  return qtyFormat.format(Math.round(Number(n) || 0));
}

export function formatMoney(n) {
  return `₹${moneyFormat.format(Math.round(Number(n) || 0))}`;
}

export function formatMonth(month) {
  if (!month) return '';
  const m = Number(String(month).slice(5, 7));
  return MONTHS[m - 1] ?? '';
}

