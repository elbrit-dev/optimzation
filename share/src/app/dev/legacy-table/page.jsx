'use client';

/* Dev harness for the LEGACY DataTable shapes.
 *
 * WHY THIS EXISTS
 * The legacy tree — DataTableNew.jsx, which both graphql-playground
 * TableViewers also render — was migrated onto the design-system PassThrough
 * preset, and that migration needed pixel cover the way SmartDataTable's did.
 * It could not get it in place: every legacy route (/datatable,
 * /datatable/column-group-demo, /datatable/slots-demo, both playgrounds) is
 * wrapped in ProtectedRoute and driven by a Frappe backend, so Playwright
 * reaches the login screen rather than a table. /dev/smart-table is the only
 * unprotected route, and it exists for exactly this reason.
 *
 * So rather than harness DataTableNew's app wiring, this harness renders the
 * PRESET SECTIONS that the legacy tree adds on top of what SmartDataTable
 * exercises — `selectionMode`, `editMode="cell"`, `size="small"` and
 * footerColumnGroup. Those sections are the migration risk; DataTableNew's own
 * correctness then follows from it spreading the same dsDataTableProps().
 *
 * Static data, no network, no auth — so it is deterministic enough to
 * screenshot. Deliberately NOT wrapped in ProtectedRoute.
 */

import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { InputText } from 'primereact/inputtext';
import { Paginator } from 'primereact/paginator';
import { dsDataTableProps } from '@/design-system/primereact/dataTableProps';
import { inputTextPt } from '@/design-system/primereact/inputTextPreset';

/* Same fixture as /datatable/column-group-demo, trimmed to five rows: the
   sixth onward add height without exercising anything new, and a shorter
   image is a faster diff. */
const ROWS = [
  { product: 'Bamboo Watch', lastYearSale: 51, thisYearSale: 40, newValue: 120, lastYearProfit: 54406, thisYearProfit: 43342 },
  { product: 'Black Watch', lastYearSale: 83, thisYearSale: 9, newValue: 245, lastYearProfit: 423132, thisYearProfit: 312122 },
  { product: 'Blue Band', lastYearSale: 38, thisYearSale: 5, newValue: 89, lastYearProfit: 12321, thisYearProfit: 8500 },
  { product: 'Blue T-Shirt', lastYearSale: 49, thisYearSale: 22, newValue: 312, lastYearProfit: 745232, thisYearProfit: 65323 },
  { product: 'Brown Purse', lastYearSale: 17, thisYearSale: 79, newValue: 156, lastYearProfit: 643242, thisYearProfit: 500332 },
];

const money = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Section({ title, note, children }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="type-app-label text-heading">{title}</h2>
        <p className="type-app-body text-ds-secondary">{note}</p>
      </div>
      {children}
    </section>
  );
}

export default function LegacyTableDevHarness() {
  const [selectedOne, setSelectedOne] = useState(ROWS[1]);
  const [selectedMany, setSelectedMany] = useState([ROWS[0], ROWS[2]]);
  const [editRows, setEditRows] = useState(ROWS);
  const [pageFirst, setPageFirst] = useState(10);

  const headerGroup = (
    <ColumnGroup>
      <Row>
        <Column header="Product" rowSpan={2} />
        <Column header="Sale Rate" colSpan={3} />
        <Column header="Profits" colSpan={2} />
      </Row>
      <Row>
        <Column header="Last Year" field="lastYearSale" sortable />
        <Column header="This Year" field="thisYearSale" sortable />
        <Column header="Change" field="newValue" sortable />
        <Column header="Last Year" field="lastYearProfit" sortable />
        <Column header="This Year" field="thisYearProfit" sortable />
      </Row>
    </ColumnGroup>
  );

  const footerGroup = (
    <ColumnGroup>
      <Row>
        <Column footer="Totals:" colSpan={4} />
        <Column footer={money(ROWS.reduce((a, r) => a + r.lastYearProfit, 0))} />
        <Column footer={money(ROWS.reduce((a, r) => a + r.thisYearProfit, 0))} />
      </Row>
    </ColumnGroup>
  );

  /* `editMode="cell"` needs an editor per column. A bare InputText on the
     design-system preset is enough to show the cell's editing treatment,
     which is the section under test. */
  const textEditor = (options) => (
    <InputText
unstyled
      unstyled
      pt={inputTextPt}
      value={options.value}
      onChange={(e) => options.editorCallback(e.target.value)}
    />
  );

  const onCellEditComplete = ({ rowData, newValue, field, originalEvent }) => {
    if (newValue == null || newValue === '') return originalEvent.preventDefault();
    setEditRows((prev) => prev.map((r) => (r === rowData ? { ...r, [field]: newValue } : r)));
  };

  return (
    <div data-surface="console" className="min-h-screen bg-page">
      <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-8">
        <header>
          <h1 className="type-doc-head text-heading">Legacy DataTable harness</h1>
          <p className="type-app-body text-ds-secondary">
            The preset sections the legacy tree adds: selection, cell editing,
            small size, footer groups. Static data, no auth.
          </p>
        </header>

        <Section
          title="Column + footer groups, size=small"
          note="What /datatable/column-group-demo renders. size=small is 8px on both axes, matching lara's .p-datatable-sm."
        >
          <div data-testid="legacy-groups">
            <DataTable
              {...dsDataTableProps({ size: 'small' })}
              size="small"
              value={ROWS}
              headerColumnGroup={headerGroup}
              footerColumnGroup={footerGroup}
              showGridlines
              stripedRows
            >
              <Column field="product" />
              <Column field="lastYearSale" body={(r) => `${r.lastYearSale}%`} />
              <Column field="thisYearSale" body={(r) => `${r.thisYearSale}%`} />
              <Column field="newValue" />
              <Column field="lastYearProfit" body={(r) => money(r.lastYearProfit)} />
              <Column field="thisYearProfit" body={(r) => money(r.thisYearProfit)} />
            </DataTable>
          </div>
        </Section>

        <Section
          title="selectionMode=single"
          note="No selection control — the treatment is the selected row itself: brand tint plus brand text, and hover suppressed while selected."
        >
          <div data-testid="legacy-single">
            <DataTable
              {...dsDataTableProps()}
              value={ROWS}
              selectionMode="single"
              selection={selectedOne}
              onSelectionChange={(e) => setSelectedOne(e.value)}
              showGridlines
              stripedRows
            >
              <Column field="product" header="Product" sortable />
              <Column field="newValue" header="Change" sortable />
              <Column field="thisYearProfit" header="This Year" body={(r) => money(r.thisYearProfit)} />
            </DataTable>
          </div>
        </Section>

        <Section
          title="selectionMode=checkbox"
          note="Exercises the headerCheckbox / rowCheckbox sections, including the indeterminate header state."
        >
          <div data-testid="legacy-checkbox">
            <DataTable
              {...dsDataTableProps()}
              value={ROWS}
              selectionMode="checkbox"
              selection={selectedMany}
              onSelectionChange={(e) => setSelectedMany(e.value)}
              showGridlines
              stripedRows
            >
              <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
              <Column field="product" header="Product" sortable />
              <Column field="newValue" header="Change" sortable />
              <Column field="thisYearProfit" header="This Year" body={(r) => money(r.thisYearProfit)} />
            </DataTable>
          </div>
        </Section>

        <Section
          title='editMode="cell"'
          note="Click a Product or Change cell. The cell drops its padding to 0 so the editor fills it, and takes an inset brand ring."
        >
          <div data-testid="legacy-edit">
            <DataTable
              {...dsDataTableProps()}
              value={editRows}
              editMode="cell"
              showGridlines
              stripedRows
            >
              <Column
                field="product"
                header="Product"
                editor={textEditor}
                onCellEditComplete={onCellEditComplete}
              />
              <Column
                field="newValue"
                header="Change"
                editor={textEditor}
                onCellEditComplete={onCellEditComplete}
              />
              <Column field="thisYearProfit" header="This Year" body={(r) => money(r.thisYearProfit)} />
            </DataTable>
          </div>
        </Section>
        <Section
          title="Standalone Paginator"
          note="Not inside a DataTable. DataTableNew renders one of these; it was the last lara-themed piece and the largest block in globals.css at 21 rules."
        >
          <div data-testid="legacy-paginator" className="bg-surface">
            <Paginator
              /* Styling comes from the global registry; this only opts out of
                 the lara theme. A paginator nested in a DataTable inherits
                 `unstyled` from it, but a standalone one does not. */
              unstyled
              first={pageFirst}
              rows={10}
              totalRecords={120}
              rowsPerPageOptions={[10, 20, 50]}
              onPageChange={(e) => setPageFirst(e.first)}
              template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            />
          </div>
        </Section>
      </main>
    </div>
  );
}
