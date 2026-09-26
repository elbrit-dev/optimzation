import { describe, it, expect } from 'vitest';
import { mergePt } from '../mergePt';
import { dataTableHooks } from '../dataTableHooks';
import { dataTablePt } from '../dataTablePreset';

describe('mergePt', () => {
  it('concatenates className instead of last-wins', () => {
    const r = mergePt({ className: 'a' }, { className: 'b' });
    expect(r.className).toBe('a b');
  });

  it('keeps attributes from both sides', () => {
    const r = mergePt({ 'data-x': '1' }, { className: 'b' });
    expect(r).toEqual({ 'data-x': '1', className: 'b' });
  });

  it('returns a function when either side is a function, merging on call', () => {
    const r = mergePt(
      ({ context }) => ({ 'data-frozen': String(context.frozen) }),
      { className: 'cell' },
    );
    expect(typeof r).toBe('function');
    expect(r({ context: { frozen: true } })).toEqual({
      'data-frozen': 'true',
      className: 'cell',
    });
  });

  it('merges two functions', () => {
    const r = mergePt(
      ({ context }) => ({ 'data-i': context.index }),
      ({ context }) => ({ className: context.index % 2 ? 'odd' : 'even' }),
    );
    expect(r({ context: { index: 3 } })).toEqual({ 'data-i': 3, className: 'odd' });
  });

  it('recurses into nested section groups', () => {
    const r = mergePt(
      { column: { bodyCell: { 'data-p': 'cell' } } },
      { column: { bodyCell: { className: 'px-4' }, sortIcon: { className: 'ml-2' } } },
    );
    expect(r.column.bodyCell).toEqual({ 'data-p': 'cell', className: 'px-4' });
    expect(r.column.sortIcon).toEqual({ className: 'ml-2' });
  });

  it('tells a props object apart from a section group', () => {
    // `{ root: {...} }` is a group; `{ className }` is props. Getting this
    // backwards would nest a className under a fake section and drop it.
    const r = mergePt({ paginator: { root: { 'data-p': 'pg' } } }, { paginator: { root: { className: 'flex' } } });
    expect(r.paginator.root).toEqual({ 'data-p': 'pg', className: 'flex' });
  });

  it('passes either side through when the other is missing', () => {
    expect(mergePt(null, { className: 'x' })).toEqual({ className: 'x' });
    expect(mergePt({ className: 'x' }, null)).toEqual({ className: 'x' });
  });
});

/* The real merge is what ships, so assert on it directly rather than on
   hand-built fixtures — a section renamed in either file shows up here. */
describe('mergePt(dataTableHooks, dataTablePt) — the shipped merge', () => {
  const merged = mergePt(dataTableHooks, dataTablePt);

  it('a hook-only section keeps its attribute', () => {
    expect(merged.tfoot['data-table-part']).toBe('foot');
  });

  it('a section in both files carries hook AND class', () => {
    expect(merged.tbody).toEqual({ 'data-table-part': 'body', className: 'bg-surface' });
  });

  it('bodyRow merges an attribute onto a context function', () => {
    const out = merged.bodyRow({ context: { stripedRows: true, index: 1 } });
    expect(out['data-table-part']).toBe('row');
    expect(out.className).toContain('bg-row-alt');
  });

  it('headerCell carries data-frozen and the frozen sticky classes together', () => {
    const out = merged.column.headerCell({ props: { frozen: true }, context: {} });
    expect(out['data-frozen']).toBe('true');
    expect(out.className).toContain('sticky');
    expect(out.className).toContain('type-table-head');
  });

  it('a non-frozen cell reports data-frozen="false" rather than omitting it', () => {
    const out = merged.column.bodyCell({ props: {}, context: {} });
    expect(out['data-frozen']).toBe('false');
    expect(out.className).not.toContain('sticky');
  });

  it('nested paginator sections merge', () => {
    expect(merged.paginator.root['data-table-part']).toBe('paginator');
    expect(merged.paginator.root.className).toContain('flex');
    expect(merged.paginator.RPPDropdown.root['data-table-part']).toBe('paginator-rpp');
    expect(merged.paginator.RPPDropdown.root.className).toContain('h-control-sm');
  });
});
