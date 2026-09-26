'use client';

import Editor from '@monaco-editor/react';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { Toast } from 'primereact/toast';
import { Tree } from 'primereact/tree';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { deserializeReportConfig } from '@/components/SmartDataTable/SmartDataProvider';
import {
  formatReportConfigJs,
  loadReportConfig,
  parseAndMigrateReportConfig,
  saveReportConfig,
} from '@/app/report-table/config/reportConfigService';
import { getLiveStores, subscribeToStoreRegistry } from '@/components/SmartDataTable/useSmartDataStore';
import { buildViewDataState } from '@/components/SmartDataTable/viewContextHelpers';

const TAB_READ    = 'read';
const TAB_EDIT    = 'edit';
const TAB_DOCS    = 'docs';
const TAB_CONTEXT = 'context';

const EXCLUDED_IDS = new Set(['#__ID__#']);

function configureMonaco(monaco) {
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
  });
  monaco.languages.registerDocumentFormattingEditProvider('javascript', {
    provideDocumentFormattingEdits(model) {
      const formatted = formatReportConfigJs(model.getValue(), deserializeReportConfig);
      if (!formatted) return [];
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  });
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 'var(--fs-12)',
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  lineNumbers: 'on',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  hover: { enabled: false },
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  renderValidationDecorations: 'off',
  matchBrackets: 'never',
  links: false,
  colorDecorators: false,
  foldingHighlight: false,
  codeLens: false,
  lightbulb: { enabled: 'off' },
  parameterHints: { enabled: false },
};

// ─── Config Read tab ──────────────────────────────────────────────────────────

function HighlightMatch({ text, query }) {
  if (!query?.trim()) return <>{text}</>;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning-wash text-warning rounded-sm not-italic">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ValueChip({ value, query }) {
  if (value === null || value === undefined)
    return <span className="text-11 font-mono text-ds-muted italic">null</span>;
  if (typeof value === 'function') {
    const code = value.toString();
    const preview = code.split('\n')[0].slice(0, 48);
    return (
      <span className="text-11 font-mono text-warning italic" title={code}>
        {preview}{code.length > 48 ? ' …' : ''}
      </span>
    );
  }
  if (typeof value === 'boolean')
    return (
      <span className={`text-11 font-mono font-semibold ${value ? 'text-brand' : 'text-ds-muted'}`}>
        <HighlightMatch text={String(value)} query={query} />
      </span>
    );
  if (typeof value === 'number')
    return (
      <span className="text-11 font-mono text-brand">
        <HighlightMatch text={String(value)} query={query} />
      </span>
    );
  if (typeof value === 'string')
    return (
      <span
        className="text-11 font-mono text-success max-w-[180px] truncate inline-block align-bottom"
        title={value}
      >
        &quot;<HighlightMatch text={value} query={query} />&quot;
      </span>
    );
  if (Array.isArray(value) && value.length === 0)
    return <span className="text-11 font-mono text-ds-muted">[ ]</span>;
  if (typeof value === 'object' && Object.keys(value).length === 0)
    return <span className="text-11 font-mono text-ds-muted">{'{}'}</span>;
  return null;
}

function valueToSearchLabel(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'function') return 'fn()';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '';
}

function configToTreeNodes(obj, parentKey = '') {
  const entries = Array.isArray(obj)
    ? obj.map((v, i) => [String(i), v])
    : Object.entries(obj);

  return entries.map(([key, value]) => {
    const nodeKey = parentKey ? `${parentKey}.${key}` : key;
    const isFunc = typeof value === 'function';
    const isArr = Array.isArray(value);
    const isObj = !isArr && value !== null && typeof value === 'object';
    const hasChildren = !isFunc && (isArr ? value.length > 0 : isObj && Object.keys(value).length > 0);

    if (hasChildren) {
      return {
        key: nodeKey,
        label: key,
        data: { key, value, isArray: isArr },
        leaf: false,
        children: configToTreeNodes(value, nodeKey),
      };
    }

    // Leaf — embed value in label so built-in filter can match on it
    return {
      key: nodeKey,
      label: `${key} ${valueToSearchLabel(value)}`.trim(),
      data: { key, value },
      leaf: true,
    };
  });
}

const REPORT_CONFIG_KEY_ORDER = ['api', 'table', 'controls', 'views'];

function filterTreeNodes(nodes, query) {
  const q = query.toLowerCase();
  return nodes.reduce((acc, node) => {
    if (node.label?.toLowerCase().includes(q)) {
      acc.push(node);
    } else if (node.children) {
      const matched = filterTreeNodes(node.children, q);
      if (matched.length > 0) acc.push({ ...node, children: matched });
    }
    return acc;
  }, []);
}

function collectAllBranchKeys(nodes, out = {}) {
  nodes?.forEach((n) => {
    if (!n.leaf) { out[n.key] = true; collectAllBranchKeys(n.children, out); }
  });
  return out;
}

function ReportConfigReadableView({ configString }) {
  const { config, error } = useMemo(() => {
    if (!configString?.trim()) return { config: null, error: null };
    const { config: migrated } = parseAndMigrateReportConfig(configString, deserializeReportConfig);
    if (!migrated) return { config: null, error: 'Invalid config' };
    return { config: migrated, error: null };
  }, [configString]);

  const treeNodes = useMemo(() => {
    if (!config || typeof config !== 'object') return [];
    const orderedKeys = [
      ...REPORT_CONFIG_KEY_ORDER.filter((k) => k in config),
      ...Object.keys(config).filter((k) => !REPORT_CONFIG_KEY_ORDER.includes(k)),
    ];
    return configToTreeNodes(Object.fromEntries(orderedKeys.map((k) => [k, config[k]])));
  }, [config]);

  const [expandedKeys, setExpandedKeys] = useState({});
  const [filterValue, setFilterValue] = useState('');

  useEffect(() => {
    if (!config) return;
    setExpandedKeys(Object.fromEntries(Object.keys(config).map((k) => [k, true])));
  }, [config]);

  const displayNodes = useMemo(() => {
    if (!filterValue.trim()) return treeNodes;
    return filterTreeNodes(treeNodes, filterValue.trim());
  }, [treeNodes, filterValue]);

  // Expand all branch nodes while a filter is active
  useEffect(() => {
    if (filterValue.trim()) {
      setExpandedKeys(collectAllBranchKeys(treeNodes));
    } else if (config) {
      setExpandedKeys(Object.fromEntries(Object.keys(config).map((k) => [k, true])));
    }
  }, [filterValue, treeNodes, config]);

  const nodeTemplate = useCallback((node) => {
    const { data } = node;
    if (node.leaf) {
      return (
        <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="text-11 font-medium text-ds-secondary shrink-0">
            <HighlightMatch text={data.key} query={filterValue} />
          </span>
          <span className="text-10 text-ds-muted shrink-0">:</span>
          <ValueChip value={data.value} query={filterValue} />
        </span>
      );
    }
    const count = data.isArray ? data.value.length : Object.keys(data.value ?? {}).length;
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-11 font-semibold text-body">
          <HighlightMatch text={data.key} query={filterValue} />
        </span>
        <span className="text-10 font-mono text-ds-muted bg-sunken rounded px-1 py-0.5 leading-none">
          {data.isArray ? `[${count}]` : `{${count}}`}
        </span>
      </span>
    );
  }, [filterValue]);

  if (error) {
    return (
      <div className="m-3 p-3 text-xs text-danger bg-danger-wash border border-danger-border rounded-lg">
        <span className="font-semibold">Parse error:</span> {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-ds-muted px-4 text-center">
        Select or load a config to view.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Custom search bar with icon on the left */}
      <div className="px-3 py-2 border-b border-line-subtle shrink-0">
        <div className="relative">
          <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-muted pointer-events-none" style={{ fontSize: 'var(--fs-11)' }} />
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Search keys or values…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-line-subtle rounded-md focus:outline-none focus:ring-1 focus:ring-focus bg-surface"
          />
          {filterValue && (
            <button
              type="button"
              onClick={() => setFilterValue('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-muted hover:text-ds-secondary"
            >
              <i className="pi pi-times" style={{ fontSize: 'var(--fs-10)' }} />
            </button>
          )}
        </div>
      </div>
      <Tree
unstyled
        value={displayNodes}
        expandedKeys={expandedKeys}
        onToggle={(e) => setExpandedKeys(e.value)}
        nodeTemplate={nodeTemplate}
        className="config-read-tree w-full border-none text-xs p-0"
        pt={{
          root: { className: 'border-none shadow-none rounded-none p-0 h-full flex flex-col' },
          wrapper: { className: 'flex-1 overflow-y-auto min-h-0 pt-0' },
          container: { className: 'p-0 m-0' },
          node: { className: 'py-0' },
          content: { className: 'py-0.5 px-2 rounded hover:bg-brand-tint-weak transition-colors' },
          toggler: { className: 'w-5 h-5 shrink-0 text-ds-muted hover:bg-brand-tint rounded transition-colors' },
          label: { className: 'text-xs' },
        }}
      />
    </div>
  );
}

// ─── Docs tab ────────────────────────────────────────────────────────────────

function CodeBlock({ children }) {
  if (!children?.trim()) return null;
  return (
    <pre className="mt-1.5 text-xs font-mono bg-sunken text-body rounded p-2 overflow-x-auto whitespace-pre-wrap break-words border border-line-subtle">
      <code>{children.trim()}</code>
    </pre>
  );
}

function ReportDocsPanel() {
  return (
    <div className="flex flex-col h-full min-h-0 text-body">
      <div className="shrink-0 px-3 py-2 border-b border-line-subtle bg-sunken">
        <div className="text-xs font-semibold text-body">reportConfig reference</div>
        <p className="text-11 text-ds-muted mt-0.5">SmartDataProvider + SmartDataTable</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">

        {/* Shape */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">Shape</div>
          <CodeBlock>{`{
  api:      { ... },
  table:    { ... },
  controls: [ ... ],
  views:    { ... },
}`}</CodeBlock>
        </section>

        {/* api */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">api</div>
          <CodeBlock>{`api: {
  urlKey: 'myApi',
  reportApiVersion: 'v1',  // 'v1' (default) | 'v2' — see below
  drillDown: { enabled: false, initialDepth: 2 },  // v2 only — see below
  index: 'Primary',  // Saved tab query name; GQL from that query
  indexVariables: { startDate: '2026-01-01', endDate: '2026-01-31' },
  indexVariablesMap: {
    'controls.dates.start': 'startDate',
    'controls.dates.end':   'endDate',
  },
  variables: {
    report: 'ReportName',
    filters: {},
  },
  variableTypes: {
    report: 'String',
    filters: 'JSON',
  },
  variablesMap: {
    'controls.dates.start': 'filters.from_date',
    'controls.dates.end':   'filters.to_date',
    'controls.status.value': {
      path: 'filters.status',
      transform: (v) => v.toUpperCase(),
    },
  },
}`}</CodeBlock>
          <p className="text-11 text-ds-secondary mt-1.5">
            <code className="font-mono text-brand">reportApiVersion</code> selects which
            backend field <code className="font-mono text-brand">graphqlQueryReportDataSource</code>{' '}
            calls. Defaults to <code className="font-mono text-brand">&apos;v1&apos;</code> (legacy{' '}
            <code className="font-mono text-brand">customReport</code>, unchanged behavior) so
            existing configs are unaffected. Set to{' '}
            <code className="font-mono text-brand">&apos;v2&apos;</code> per <em>view</em> (it can
            be overridden inside <code className="font-mono text-brand">views.&lt;id&gt;.api</code>{' '}
            just like any other api field) once that view&apos;s <code className="font-mono text-brand">group_by</code>{' '}
            /<code className="font-mono text-brand">selected_columns</code> have been checked against{' '}
            <code className="font-mono text-brand">customReportV2</code>&apos;s stricter validation
            (e.g. target metrics require grouping by Department or HQ).
          </p>
          <p className="text-11 text-ds-secondary mt-1.5">
            On <code className="font-mono text-brand">&apos;v2&apos;</code> the sidebar filter
            dropdowns are served by the{' '}
            <code className="font-mono text-brand">reportFilterValues</code> query, one dimension
            at a time when a dropdown is opened, instead of riding along on the report. The report no
            longer returns them at all &mdash;{' '}
            <code className="font-mono text-brand">_meta.meta_filter_values</code> is always{' '}
            <code className="font-mono text-brand">{'{}'}</code> &mdash; so the tab list is a fixed
            ten dimensions rather than whatever the response happened to carry. v1 views keep using{' '}
            <code className="font-mono text-brand">elbrit_sales_filter_api</code>.
          </p>
          <p className="text-11 text-ds-secondary mt-1.5">
            <code className="font-mono text-brand">drillDown</code> makes the first request
            ask for only the top <code className="font-mono text-brand">initialDepth</code>{' '}
            levels of <code className="font-mono text-brand">group_by</code>, and fetches each
            node&apos;s children from the{' '}
            <code className="font-mono text-brand">reportDrillDown</code> query when the user
            expands it. A five-level <code className="font-mono text-brand">group_by</code> over
            a year returns ~204k rows and takes over a minute in one call; the same request split
            this way renders in seconds and each expand costs one bounded query.
          </p>
          <p className="text-11 text-ds-secondary mt-1.5">
            It is <strong>ignored unless the view also resolves to{' '}
            <code className="font-mono text-brand">&apos;v2&apos;</code></strong> &mdash;{' '}
            <code className="font-mono text-brand">reportDrillDown</code> has no v1 equivalent.
            Two things change for views that enable it: the inline column-filter row is hidden
            (it can only filter rows already fetched, so it would silently filter a partial tree
            &mdash; use the sidebar filters, which go to the server), and Export re-fetches at
            full depth before writing the file, which is slow but complete.
          </p>
        </section>

        {/* controls */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">controls</div>
          <div className="space-y-1.5">
            {[
              { type: 'dateRange',  desc: 'Date range picker → { start, end }',          ex: "{ key: 'dates',   type: 'dateRange',  label: 'Date Range' }" },
              { type: 'toggle',     desc: 'On/off switch → true | false',                 ex: "{ key: 'active',  type: 'toggle',     label: 'Active only', defaultValue: false }" },
              { type: 'filterSort', desc: 'Filter + sort sidebar → { filters, sort }',    ex: "{ key: 'filters', type: 'filterSort', label: 'Filters' }" },
              { type: 'refresh',    desc: 'Refetch button, shows last-fetched time',       ex: "{ key: 'reload',  type: 'refresh' }" },
            ].map(({ type, desc, ex }) => (
              <details key={type} className="group border border-line-subtle rounded bg-sunken/40 open:bg-surface open:border-line-subtle open:shadow-card">
                <summary className="cursor-pointer select-none px-2.5 py-1.5 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <i className="pi pi-chevron-right text-10 text-ds-muted group-open:rotate-90 transition-transform shrink-0" />
                  <code className="text-11 font-mono text-brand shrink-0">{type}</code>
                  <span className="text-11 text-ds-secondary truncate">{desc}</span>
                </summary>
                <div className="px-2.5 pb-2 border-t border-line-subtle">
                  <CodeBlock>{ex}</CodeBlock>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* table */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">table <span className="normal-case font-normal text-ds-muted">(all optional, defaults shown)</span></div>
          <div className="space-y-0.5">
            {[
              ['scrollHeight',           "'600px'",  'Fixed body height; enables scroll'],
              ['enablePaginator',        'true',      'Page results; use with defaultPageSize, pageSizeOptions'],
              ['defaultPageSize',        '50',        'Rows per page'],
              ['enableSort',             'true',      'Column header click to sort'],
              ['enableFilterRow',        'true',      'Inline filter inputs under headers'],
              ['enableTotalRow',         'true',      'Sum row for numeric columns'],
              ['enableResizableColumns', 'true',      'Drag column edges to resize'],
              ['enableColumnVisibility', 'true',      'Show/hide columns via toolbar'],
              ['enableColumnFreeze',     'true',      'Pin columns via toolbar'],
              ['enableExport',           'true',      'CSV/Excel download; pair with exportFilename'],
              ['enableFullscreen',       'true',      'Expand table to full screen'],
              ['enableStripedRows',      'true',      'Alternating row shading'],
              ['enableGridlines',        'true',      'Row/column borders'],
              ['emptyMessage',           "'No records found.'", 'Empty state text'],
            ].map(([key, def, note]) => (
              <div key={key} className="flex items-baseline justify-between gap-2 py-1 px-2 rounded hover:bg-brand-tint-weak">
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <code className="text-11 font-mono text-brand">{key}</code>
                  <code className="text-11 font-mono text-ds-muted">{def}</code>
                </div>
                <span className="text-11 text-ds-muted text-right">{note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* context */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">Plasmic context</div>
          <p className="text-11 text-ds-secondary mb-2">
            Bind via <code className="font-mono text-brand">data.views.[viewId]</code> in Plasmic Studio.
            Top-level also has <code className="font-mono text-brand">fetchedAt</code>.
          </p>
          <div className="space-y-1.5">
            {[
              {
                key: 'data',
                desc: 'Fetched table data',
                rows: [
                  ['rows[]',       'Plain value objects — repr stripped, children flattened'],
                  ['columns[]',    'Column definitions (null before first fetch)'],
                  ['groups[]',     'Pivot column group headers or null'],
                  ['count',        'Total row count (server-side)'],
                  ['totals{}',     'Column sums from API (field → value)'],
                  ['dimensions[]', 'Filter dimension metadata'],
                  ['loading',      'boolean — fetch in progress'],
                  ['status',       "'idle' | 'loading' | 'success' | 'error'"],
                  ['error',        'string | null — message when status is error'],
                ],
              },
              {
                key: 'state',
                desc: 'Current view state',
                rows: [
                  ['loading', 'boolean — fetch in progress'],
                  ['status',  "'idle' | 'loading' | 'success' | 'error'"],
                  ['error',   'string | null'],
                  ['filters', '{ [field]: filterValue }'],
                  ['sort',    "{ [field]: 'asc' | 'desc' }"],
                  ['page',    '{ first, rows }'],
                ],
              },
              {
                key: 'actions',
                desc: 'Callable from Plasmic event handlers',
                rows: [
                  ['column.toggle(field)',          'Show / hide a column'],
                  ['column.lock()',                 'Toggle freeze first column'],
                  ['group.reorder(newOrder)',        'Reorder group-by fields'],
                  ['export.excel()',                'Download XLSX'],
                  ['display.fullscreen()',          'Open fullscreen dialog'],
                  ['page.next() / prev()',          'Navigate pages'],
                  ['page.first() / last()',         'Jump to first or last page'],
                  ['page.goto(n)',                  'Jump to page n (1-based)'],
                  ['page.setSize(n)',               'Change page size'],
                  ['drawer.open([{id, config}])',   'Open drawer with tabs; each id is a viewId'],
                  ['drawer.close()',                'Close the drawer'],
                  ['sort.set(sort)',                'Set sort { [field]: dir }'],
                ],
              },
            ].map(({ key, desc, rows }) => (
              <details key={key} className="group border border-line-subtle rounded bg-sunken/40 open:bg-surface open:border-line-subtle open:shadow-card">
                <summary className="cursor-pointer select-none px-2.5 py-1.5 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <i className="pi pi-chevron-right text-10 text-ds-muted group-open:rotate-90 transition-transform shrink-0" />
                  <code className="text-11 font-mono text-brand shrink-0">{key}</code>
                  <span className="text-11 text-ds-secondary truncate">{desc}</span>
                </summary>
                <div className="px-2.5 pb-1.5 border-t border-line-subtle space-y-0">
                  {rows.map(([k, note]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 py-0.5 px-1 rounded hover:bg-brand-tint-weak">
                      <code className="text-11 font-mono text-brand shrink-0">{k}</code>
                      <span className="text-11 text-ds-muted text-right">{note}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* views */}
        <section>
          <div className="text-10 font-bold uppercase tracking-wider text-ds-muted mb-1.5">views</div>
          <CodeBlock>{`views: {
  main: {
    name: 'Orders',
    type: 'normal',
    table: {
      scrollHeight: '400px',
      drawer: {
        viewId: 'detail',
        params: { orderId: 'name' },
      },
    },
  },
  detail: {
    name: 'Order Lines',
    type: 'drawer',
    position: 'bottom',
    height: '40vh',
  },
}`}</CodeBlock>
        </section>

      </div>
    </div>
  );
}

// ─── Context tab ─────────────────────────────────────────────────────────────

/**
 * Merged `views` across every mounted SmartDataProvider.
 *
 * This panel renders in the sibling splitter pane, outside the provider tree, so it
 * reads the instance registry instead of a store from context. Re-subscribes whenever
 * a provider mounts or unmounts.
 */
function useAllProviderViews() {
  const [storeViews, setStoreViews] = useState({});

  useEffect(() => {
    let storeUnsubs = [];

    const collect = () => {
      const merged = {};
      for (const store of getLiveStores()) Object.assign(merged, store.getState().views);
      setStoreViews(merged);
    };

    const rewire = () => {
      storeUnsubs.forEach(unsub => unsub());
      storeUnsubs = getLiveStores().map(store => store.subscribe(collect));
      collect();
    };

    const unsubRegistry = subscribeToStoreRegistry(rewire);
    rewire();
    return () => {
      unsubRegistry();
      storeUnsubs.forEach(unsub => unsub());
    };
  }, []);

  return storeViews;
}

function ContextPanel() {
  const storeViews = useAllProviderViews();

  const plasmicData = useMemo(() => {
    const views = {};
    for (const [viewId, view] of Object.entries(storeViews)) {
      const base = buildViewDataState(view);
      views[viewId] = {
        ...base,
        data: { ...base.data, rows: base.data.rows.slice(0, 5) },
        actions: {
          column:  { toggle: '(field) => void', lock: '() => void' },
          group:   { reorder: '(newOrder) => void' },
          export:  { excel: '() => void' },
          display: { fullscreen: '() => void' },
          page:    { next: '() => void', prev: '() => void', first: '() => void', last: '() => void', goto: '(n) => void', setSize: '(n) => void' },
          drawer:  { open: '([{id, config}]) => void', close: '() => void' },
          sort:    { set: '(sort) => void' },
        },
      };
    }
    return { views };
  }, [storeViews]);

  const treeNodes = useMemo(() => configToTreeNodes(plasmicData), [plasmicData]);

  const [expandedKeys, setExpandedKeys] = useState({});
  const [filterValue, setFilterValue] = useState('');

  // Expand only 2 levels deep: root keys + viewId nodes. Never auto-expand rows/columns arrays.
  useEffect(() => {
    const keys = {};
    treeNodes.forEach(n => {
      if (!n.leaf) {
        keys[n.key] = true;
        n.children?.forEach(c => { if (!c.leaf) keys[c.key] = true; });
      }
    });
    setExpandedKeys(keys);
  }, [treeNodes]);

  const displayNodes = useMemo(() => {
    if (!filterValue.trim()) return treeNodes;
    return filterTreeNodes(treeNodes, filterValue.trim());
  }, [treeNodes, filterValue]);

  useEffect(() => {
    if (filterValue.trim()) {
      setExpandedKeys(collectAllBranchKeys(displayNodes));
    }
  }, [filterValue, displayNodes]);

  const nodeTemplate = useCallback((node) => {
    const { data } = node;
    if (node.leaf) {
      return (
        <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="text-11 font-medium text-ds-secondary shrink-0">
            <HighlightMatch text={data.key} query={filterValue} />
          </span>
          <span className="text-10 text-ds-muted shrink-0">:</span>
          <ValueChip value={data.value} query={filterValue} />
        </span>
      );
    }
    const count = data.isArray ? data.value.length : Object.keys(data.value ?? {}).length;
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-11 font-semibold text-body">
          <HighlightMatch text={data.key} query={filterValue} />
        </span>
        <span className="text-10 font-mono text-ds-muted bg-sunken rounded px-1 py-0.5 leading-none">
          {data.isArray ? `[${count}]` : `{${count}}`}
        </span>
      </span>
    );
  }, [filterValue]);

  const hasViews = Object.keys(storeViews).length > 0;

  if (!hasViews) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-ds-muted px-4 text-center">
        No views registered yet. Load a report config to see context data.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-line-subtle shrink-0">
        <div className="relative">
          <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-muted pointer-events-none" style={{ fontSize: 'var(--fs-11)' }} />
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Search keys or values…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-line-subtle rounded-md focus:outline-none focus:ring-1 focus:ring-focus bg-surface"
          />
          {filterValue && (
            <button
              type="button"
              onClick={() => setFilterValue('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-muted hover:text-ds-secondary"
            >
              <i className="pi pi-times" style={{ fontSize: 'var(--fs-10)' }} />
            </button>
          )}
        </div>
      </div>
      <Tree
unstyled
        value={displayNodes}
        expandedKeys={expandedKeys}
        onToggle={(e) => setExpandedKeys(e.value)}
        nodeTemplate={nodeTemplate}
        className="config-read-tree w-full border-none text-xs p-0"
        pt={{
          root: { className: 'border-none shadow-none rounded-none p-0 h-full flex flex-col' },
          wrapper: { className: 'flex-1 overflow-y-auto min-h-0 pt-0' },
          container: { className: 'p-0 m-0' },
          node: { className: 'py-0' },
          content: { className: 'py-0.5 px-2 rounded hover:bg-brand-tint-weak transition-colors' },
          toggler: { className: 'w-5 h-5 shrink-0 text-ds-muted hover:bg-brand-tint rounded transition-colors' },
          label: { className: 'text-xs' },
        }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportsConfigSidebar({ onConfigLoad }) {
  const toast      = useRef(null);
  const editorRef  = useRef(null);
  const savedRef   = useRef('');
  const liveValueRef = useRef('');

  const [configs,      setConfigs]      = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [seedValue,    setSeedValue]    = useState('');
  const [isDirty,      setIsDirty]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState(TAB_EDIT);

  useEffect(() => {
    firestoreService
      .loadAllReports()
      .then((all) => setConfigs(all.filter((c) => !EXCLUDED_IDS.has(c.name))))
      .catch(console.error);
  }, []);

  function formatConfigInEditor() {
    const editor = editorRef.current;
    const value = editor?.getValue() ?? liveValueRef.current ?? '';
    const formatted = formatReportConfigJs(value, deserializeReportConfig);
    if (!formatted) return null;
    editor?.setValue(formatted);
    liveValueRef.current = formatted;
    return formatted;
  }

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;
    liveValueRef.current = editor.getValue();
    editor.onDidChangeModelContent(() => {
      const val = editor.getValue();
      liveValueRef.current = val;
      setIsDirty(val !== savedRef.current);
    });
  }, []);

  const handleSelect = useCallback(async (name) => {
    if (!name || name === selectedName) return;
    setLoading(true);
    setSelectedName(name);
    try {
      const { configString, migrated, fromVersion, toVersion } = await loadReportConfig(name, { autoMigrate: true });
      savedRef.current = configString;
      liveValueRef.current = configString;
      setSeedValue(configString);
      setIsDirty(false);
      onConfigLoad?.(configString);
      if (migrated) {
        toast.current?.show({
          severity: 'info',
          summary: 'Config upgraded',
          detail: `Migrated from v${fromVersion} to v${toVersion}`,
          life: 3000,
        });
      }
    } catch {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to load config', life: 3000 });
    } finally {
      setLoading(false);
    }
  }, [selectedName, onConfigLoad]);

  const handleNew = useCallback(async () => {
    const name = window.prompt('Enter a name for the new config:');
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (EXCLUDED_IDS.has(trimmed)) {
      toast.current?.show({ severity: 'warn', summary: 'Reserved', detail: `"${trimmed}" is reserved.`, life: 3000 });
      return;
    }
    try {
      await firestoreService.saveReport(trimmed, '');
      setConfigs((prev) => [...prev.filter((c) => c.name !== trimmed), { name: trimmed }]
        .sort((a, b) => a.name.localeCompare(b.name)));
      handleSelect(trimmed);
    } catch {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to create config', life: 3000 });
    }
  }, [handleSelect]);

  const handleApply = useCallback(() => {
    const formatted = formatConfigInEditor();
    if (!formatted) {
      toast.current?.show({ severity: 'error', summary: 'Invalid config', detail: 'Fix syntax errors before applying', life: 3000 });
      return;
    }
    onConfigLoad?.(formatted);
  }, [onConfigLoad]);

  const handleSave = useCallback(async () => {
    if (!selectedName) return;
    setSaving(true);
    try {
      const value = editorRef.current?.getValue() ?? liveValueRef.current ?? '';
      const { configString } = await saveReportConfig(selectedName, value);
      editorRef.current?.setValue(configString);
      savedRef.current = configString;
      liveValueRef.current = configString;
      setSeedValue(configString);
      setIsDirty(false);
      toast.current?.show({ severity: 'success', summary: 'Saved', detail: `"${selectedName}" saved`, life: 2000 });
    } catch {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to save', life: 3000 });
    } finally {
      setSaving(false);
    }
  }, [selectedName]);

  const handleDelete = useCallback((name) => {
    confirmDialog({
      message: `Delete config "${name}"? This cannot be undone.`,
      header: 'Delete Config',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'ds-button-danger',
      accept: async () => {
        try {
          await firestoreService.deleteReport(name);
          setConfigs((prev) => prev.filter((c) => c.name !== name));
          if (selectedName === name) {
            setSelectedName(null);
            setSeedValue('');
            setIsDirty(false);
            savedRef.current = '';
            liveValueRef.current = '';
          }
          toast.current?.show({ severity: 'success', summary: 'Deleted', detail: `"${name}" deleted`, life: 2000 });
        } catch {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to delete', life: 3000 });
        }
      },
    });
  }, [selectedName]);

  const itemTemplate = (option) => (
    <div className="flex items-center justify-between flex-1 min-w-0 group">
      <span className="truncate">{option.name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleDelete(option.name); }}
        className="shrink-0 p-1 rounded hover:bg-danger-wash text-danger opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        title="Delete"
      >
        <i className="pi pi-trash text-xs" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface border-l border-line-subtle">
      <Toast unstyled ref={toast} />
      <ConfirmDialog unstyled />

      {/* Config selector header */}
      <div className="px-3 py-2 border-b border-line-subtle bg-sunken space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <i className="pi pi-folder-open text-primary" style={{ fontSize: 'var(--fs-14)' }} />
          <span className="font-semibold text-sm text-primary">Config</span>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
unstyled
            value={selectedName}
            onChange={(e) => handleSelect(e.value)}
            options={configs}
            optionLabel="name"
            optionValue="name"
            placeholder="Select a config…"
            className="config-preset-dropdown flex-1 min-w-0"
            panelClassName="preset-dropdown-panel"
            style={{ height: 'var(--control-h)' }}
            itemTemplate={itemTemplate}
            emptyMessage="No configs yet"
          />
          <button type="button" onClick={handleNew}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand transition-colors shrink-0"
            title="New config">
            <i className="pi pi-plus text-sm" />
          </button>
          {selectedName && (
            <button type="button" onClick={handleApply}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand transition-colors shrink-0"
              title="Apply">
              <i className="pi pi-play text-sm" />
            </button>
          )}
          {isDirty && selectedName && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand disabled:opacity-40 transition-colors shrink-0"
              title="Save">
              <i className={`pi text-sm ${saving ? 'pi-spin pi-spinner' : 'pi-save'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tab buttons */}
      {/* `flex-wrap` on the row and `whitespace-nowrap` on each button: in a
          narrow sidebar the labels were breaking mid-word ("Config" over
          "Read"). Whole buttons moving to a second line reads properly. */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-line-subtle bg-sunken/50 shrink-0">
        {[TAB_READ, TAB_EDIT, TAB_DOCS, TAB_CONTEXT].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              activeTab === tab ? 'bg-brand-fill text-on-brand' : 'text-ds-secondary hover:bg-brand-tint'
            }`}
          >
            {tab === TAB_READ ? 'Config Read' : tab === TAB_EDIT ? 'Config Edit' : tab === TAB_CONTEXT ? 'Context' : 'Docs'}
          </button>
        ))}
      </div>

      {/* Tab content — all panels always mounted, shown/hidden via CSS */}
      <div className="flex-1 min-h-0 flex flex-col relative">

        <div className={`absolute inset-0 flex flex-col ${activeTab === TAB_CONTEXT ? '' : 'hidden'}`}>
          <ContextPanel />
        </div>

        <div className={`absolute inset-0 flex flex-col ${activeTab === TAB_DOCS ? '' : 'hidden'}`}>
          <ReportDocsPanel />
        </div>

        <div className={`absolute inset-0 flex flex-col ${activeTab === TAB_READ ? '' : 'hidden'}`}>
          {!selectedName ? (
            <div className="flex items-center justify-center flex-1 text-xs text-ds-muted px-4 text-center">
              Select a config to view
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center flex-1 text-xs text-ds-muted">Loading…</div>
          ) : (
            <div className="flex-1 overflow-hidden min-h-0">
              <ReportConfigReadableView configString={liveValueRef.current || seedValue} />
            </div>
          )}
        </div>

        <div className={`absolute inset-0 flex flex-col ${activeTab === TAB_EDIT ? '' : 'hidden'}`}>
          {!selectedName ? (
            <div className="flex items-center justify-center flex-1 text-xs text-ds-muted px-4 text-center">
              Select a config to edit
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center flex-1 text-xs text-ds-muted">Loading…</div>
          ) : (
            <Editor
              key={selectedName}
              height="100%"
              language="javascript"
              theme="vs-light"
              defaultValue={seedValue}
              beforeMount={configureMonaco}
              onMount={handleMount}
              options={EDITOR_OPTIONS}
            />
          )}
        </div>

      </div>
    </div>
  );
}
