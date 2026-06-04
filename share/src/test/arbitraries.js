import * as fc from 'fast-check';

// ─── Cell / Row ───────────────────────────────────────────────────────────────

export const scalarArb = fc.oneof(
  fc.integer(),
  fc.float({ noNaN: true }),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
);

export const cellArb = fc.record({
  value: scalarArb,
  repr:  scalarArb,
});

// A single table row: keys are field names, values are { value, repr } cells
export const rowArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z_][a-z0-9_]*$/.test(s)),
  cellArb,
  { minKeys: 1, maxKeys: 8 },
);

// A row guaranteed to have a 'label' cell (required by pipeline)
export const labeledRowArb = rowArb.map(r => ({
  ...r,
  label: { value: typeof r.label?.value === 'string' ? r.label.value : 'Row', repr: 'Row' },
}));

// ─── Filter arbitraries ───────────────────────────────────────────────────────

export const textFilterArb = fc.record({
  type:  fc.constant('text'),
  value: fc.string(),
});

export const numericFilterArb = fc.record({
  type:  fc.constant('numeric'),
  value: fc.oneof(
    fc.integer().map(String),
    fc.constant('<10'),
    fc.constant('>5'),
    fc.constant('<=100'),
    fc.constant('>=0'),
    fc.constant('=42'),
    fc.constant('10<>20'),
  ),
});

export const boolFilterArb = fc.record({
  type:  fc.constant('boolean'),
  value: fc.oneof(fc.constant(true), fc.constant(false), fc.constant(null)),
});

export const multiselectFilterArb = fc.record({
  type:  fc.constant('multiselect'),
  value: fc.array(fc.string(), { maxLength: 5 }),
});

export const anyFilterArb = fc.oneof(
  textFilterArb,
  numericFilterArb,
  boolFilterArb,
  multiselectFilterArb,
);

export const filterMapArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z_]+$/.test(s)),
  anyFilterArb,
  { maxKeys: 5 },
);

// ─── Sort arbitraries ─────────────────────────────────────────────────────────

export const sortOrderArb = fc.oneof(fc.constant(1), fc.constant(-1));

export const sortEntryArb = fc.record({
  field: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z_]+$/.test(s)),
  order: sortOrderArb,
});

export const sortMetaArb = fc.array(sortEntryArb, { minLength: 1, maxLength: 3 });

// ─── Store / pagination ───────────────────────────────────────────────────────

export const paginationArb = fc.record({
  first: fc.nat(500),
  rows:  fc.integer({ min: 1, max: 200 }),
});

// ─── Tree row (for nestStep) ──────────────────────────────────────────────────

export const flatTreeRowArb = fc.record({
  label:    cellArb,
  indent:   fc.integer({ min: 0, max: 3 }),
  is_group: fc.boolean(),
});

// ─── Frappe column (for _parseFrappeResponse) ─────────────────────────────────

const FIELD_TYPES = ['Data', 'Int', 'Float', 'Currency', 'Percent', 'Date', 'Check'];
const SAFE_FIELDNAME = fc.string({ minLength: 2, maxLength: 15 })
  .filter(s => /^[a-z][a-z0-9_]*$/.test(s))
  .filter(s => !['_meta','level','indent','is_group','label','label2'].includes(s))
  .filter(s => !s.startsWith('total_'));

export const frappeColArb = fc.record({
  fieldname: SAFE_FIELDNAME,
  label:     fc.string({ minLength: 1, maxLength: 30 }),
  fieldtype: fc.oneof(...FIELD_TYPES.map(t => fc.constant(t))),
});

// Pivot column — fieldname pattern metric_YYYY_MM
export const frappePivotColArb = fc.tuple(
  SAFE_FIELDNAME,
  fc.integer({ min: 2023, max: 2027 }).map(String),
  fc.integer({ min: 1, max: 12 }).map(n => String(n).padStart(2, '0')),
).map(([metric, year, mon]) => ({
  fieldname: `${metric}_${year}_${mon}`,
  label:     `${year} ${mon} ${metric}`,
  fieldtype: 'Float',
}));

// ─── Deep merge objects ───────────────────────────────────────────────────────

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const plainObjectArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }).filter(k => !UNSAFE_KEYS.has(k)),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 6 },
);
