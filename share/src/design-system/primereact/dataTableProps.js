/* The single entry point for rendering a PrimeReact DataTable in this repo.
 *
 * There are two independent call sites — SmartDataTable and the legacy
 * DataTableNew tree (which both graphql-playground TableViewers also render) —
 * and they must not drift apart. If each assembled its own `unstyled` + `pt`
 * pair, the second one would inevitably miss a section: that is exactly how
 * InnerDataTable ended up with neither, which showed as a lara-styled child
 * table nested inside a design-system parent.
 *
 * So both sites spread the result of this one function. Adding a section means
 * editing the preset, not hunting call sites.
 *
 *   <DataTable {...dsDataTableProps()} ... />
 *
 * Pass `{ unstyled: false }` to fall back to the lara theme for one table. The
 * hooks still apply in that mode, so the e2e selectors keep working either way
 * and a visual regression can be bisected to a single table.
 */
import { makeDataTablePt } from './dataTablePreset';
import { dataTableHooks } from './dataTableHooks';
import { mergePt } from './mergePt';

/* Built once at module scope rather than per render. `mergePt` walks the whole
   section tree, and a DataTable re-renders on every sort, filter and page.

   There is now ONE styled tree, not one per size: cell padding comes from
   --table-cell-px/py, which [data-surface] resolves. See the long note in
   dataTablePreset.js for why the size variants were removed — in short, they
   let the two table trees drift to 8px vs 16px, and `size="large"` fell back
   to normal without saying so. */
const PT_HOOKS_ONLY = dataTableHooks;
const PT_STYLED = mergePt(dataTableHooks, makeDataTablePt());

/* The test hooks apply in BOTH modes; only the styling is conditional. `pt` is
   independent of `unstyled` — the former adds our attributes, the latter
   removes PrimeReact's classes — which is what lets one selector in
   e2e/pages/SmartTablePage.js address either rendering. */
export const tablePtFor = (unstyled) => (unstyled ? PT_STYLED : PT_HOOKS_ONLY);

/* `size` is still ACCEPTED so existing call sites keep working, but it no
   longer affects anything here — cell density follows [data-surface]. Leave it
   on the DataTable as its own prop if PrimeReact's internals want it; passing
   it here is now a no-op rather than a second source of truth. */
export function dsDataTableProps({ unstyled = true } = {}) {
  return {
    ...(unstyled && { unstyled: true }),
    pt: tablePtFor(unstyled),
  };
}

export default dsDataTableProps;
