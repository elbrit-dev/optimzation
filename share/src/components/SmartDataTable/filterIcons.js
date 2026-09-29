/* One icon per filter field, shared by the Filter and Sort panel's tab rail and
 * the applied-filter chips on the controls row, so a field reads the same in
 * both places. PrimeIcons classes.
 *
 * A filterDef may carry its own `icon` ("pi pi-…" or just "pi-…"); otherwise
 * the field's label/key is matched against the rules below, first hit wins.
 * Order matters: "Item group" must hit before "Item". */

const RULES = [
  [/sort/, 'pi-sort-alt'],
  [/item.?group|product.?group|category/, 'pi-th-large'],
  [/batch/, 'pi-barcode'],
  [/invoice|bill/, 'pi-file'],
  [/warehouse|stock|godown/, 'pi-building'],
  [/brand/, 'pi-tag'],
  [/item|product|sku/, 'pi-box'],
  [/customer|party|stockist|distributor|chemist/, 'pi-shopping-bag'],
  [/doctor/, 'pi-heart'],
  [/employee|sales.?person|rep\b|owner|user/, 'pi-user'],
  [/department|division|dept/, 'pi-sitemap'],
  [/\bhq\b|head.?quarter/, 'pi-map-marker'],
  [/territory|region|zone|area|state|city/, 'pi-globe'],
  [/company/, 'pi-briefcase'],
  [/status|state/, 'pi-flag'],
  [/date|month|period|year/, 'pi-calendar'],
  [/amount|value|price|rate|qty|quantity/, 'pi-wallet'],
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[_-]+/g, ' ');

export function filterIcon(def) {
  if (def?.icon) {
    const i = String(def.icon).trim();
    return i.startsWith('pi ') ? i : `pi ${i.startsWith('pi-') ? i : `pi-${i}`}`;
  }
  const hay = `${norm(def?.label)} ${norm(def?.key)}`;
  for (const [re, icon] of RULES) if (re.test(hay)) return `pi ${icon}`;
  return 'pi pi-filter';
}

/* The value as a chip shows it: ERP names carry a trailing company
 * abbreviation ("Aura & Proxima Karnataka - ELPL"), which says nothing inside
 * one company's report, so it goes. Anything still long is cut by the chip's
 * CSS width with the full value in its tooltip. */
export function shortFilterValue(value) {
  const s = String(value ?? '').trim();
  const cut = s.replace(/\s+-\s+[A-Z0-9]{2,6}$/, '');
  return cut || s;
}
