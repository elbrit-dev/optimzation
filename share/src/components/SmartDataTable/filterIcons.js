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

/* Places people already know by a short code: cities by the code in everyday
 * use (CBE, BLR, HYD). Never a code taken from a city's OLD name (MAA=Madras,
 * BOM=Bombay): those use today's name (CHE, MUM). States by their vehicle registration
 * code (TN, KA). Longest names first so "Tamil Nadu" wins over
 * any single word inside it. */
const PLACE_CODES = [
  // states / UTs
  ['andhra pradesh', 'AP'], ['arunachal pradesh', 'AR'], ['himachal pradesh', 'HP'], ['madhya pradesh', 'MP'],
  ['uttar pradesh', 'UP'], ['west bengal', 'WB'], ['tamil nadu', 'TN'], ['tamilnadu', 'TN'], ['jammu and kashmir', 'JK'],
  ['karnataka', 'KA'], ['kerala', 'KL'], ['telangana', 'TG'], ['maharashtra', 'MH'], ['gujarat', 'GJ'],
  ['rajasthan', 'RJ'], ['odisha', 'OD'], ['orissa', 'OD'], ['bihar', 'BR'], ['jharkhand', 'JH'], ['punjab', 'PB'],
  ['haryana', 'HR'], ['uttarakhand', 'UK'], ['chhattisgarh', 'CG'], ['assam', 'AS'], ['puducherry', 'PY'], ['pondicherry', 'PY'],
  // cities
  ['thiruvananthapuram', 'TRV'], ['trivandrum', 'TRV'], ['visakhapatnam', 'VTZ'], ['vizag', 'VTZ'],
  ['tiruchirappalli', 'TRY'], ['tiruchirapalli', 'TRY'], ['trichy', 'TRY'], ['coimbatore', 'CBE'], ['chennai', 'CHE'], ['madras', 'CHE'],
  ['madurai', 'MDU'], ['tirunelveli', 'TEN'], ['tuticorin', 'TCR'], ['thoothukudi', 'TCR'], ['salem', 'SLM'],
  ['bengaluru', 'BLR'], ['bangalore', 'BLR'], ['mysuru', 'MYS'], ['mysore', 'MYS'], ['mangaluru', 'MLR'], ['mangalore', 'MLR'],
  ['hubballi', 'HBX'], ['hubli', 'HBX'], ['belagavi', 'BGM'], ['belgaum', 'BGM'], ['hyderabad', 'HYD'], ['vijayawada', 'VGA'],
  ['tirupati', 'TIR'], ['kochi', 'KOC'], ['cochin', 'KOC'], ['ernakulam', 'KOC'], ['kozhikode', 'KOZ'], ['calicut', 'KOZ'],
  ['kannur', 'CNN'], ['mumbai', 'MUM'], ['bombay', 'MUM'], ['pune', 'PUN'], ['nagpur', 'NAG'], ['new delhi', 'DEL'], ['delhi', 'DEL'],
  ['kolkata', 'KOL'], ['calcutta', 'KOL'], ['ahmedabad', 'AMD'], ['surat', 'STV'], ['vadodara', 'VAD'], ['baroda', 'VAD'], ['jaipur', 'JAI'],
  ['lucknow', 'LKO'], ['patna', 'PAT'], ['bhubaneswar', 'BBI'], ['guwahati', 'GAU'], ['indore', 'IDR'], ['bhopal', 'BHO'],
  ['chandigarh', 'CHD'], ['goa', 'GOI'], ['ranchi', 'RNC'], ['raipur', 'RPR'],
].sort((x, y) => y[0].length - x[0].length);
const PLACE_RE = PLACE_CODES.map(([name, code]) => [new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'gi'), code]);

/* The value as a chip shows it, full value in the chip's tooltip:
 *   1. ERP names carry a trailing company abbreviation ("… - ELPL"), which
 *      says nothing inside one company's report, so it goes.
 *   2. Known places become their common code (Coimbatore → CBE).
 *   3. Codes stay whole: all-caps words (CND, HQ), anything starting with a
 *      digit (650, 10ml) and symbols (&).
 *   4. Every other word becomes its first 3 letters in caps.
 *   CND Coimbatore → CND CBE · Aura & Proxima Karnataka - ELPL → AUR & PRO KA */
export function shortFilterValue(value) {
  const s = String(value ?? '').trim();
  let base = s.replace(/\s+-\s+[A-Z0-9]{2,6}$/, '') || s;
  for (const [re, code] of PLACE_RE) base = base.replace(re, code);
  return base
    .split(/\s+/)
    .map((w) => {
      if (/^\d/.test(w) || /^[^A-Za-z0-9]+$/.test(w) || /^[A-Z0-9&.\-/]+$/.test(w)) return w;
      const letters = w.replace(/[^A-Za-z0-9]/g, '');
      return (letters || w).slice(0, 3).toUpperCase();
    })
    .join(' ');
}
