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
import { useSmartDataStore } from '@/components/SmartDataTable/useSmartDataStore';
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
  fontSize: 12,
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
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm not-italic">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ValueChip({ value, query }) {
  if (value === null || value === undefined)
    return <span className="text-[11px] font-mono text-gray-400 italic">null</span>;
  if (typeof value === 'function') {
    const code = value.toString();
    const preview = code.split('\n')[0].slice(0, 48);
    return (
      <span className="text-[11px] font-mono text-orange-500 italic" title={code}>
        {preview}{code.length > 48 ? ' …' : ''}
      </span>
    );
  }
  if (typeof value === 'boolean')
    return (
      <span className={`text-[11px] font-mono font-semibold ${value ? 'text-violet-600' : 'text-slate-400'}`}>
        <HighlightMatch text={String(value)} query={query} />
      </span>
    );
  if (typeof value === 'number')
    return (
      <span className="text-[11px] font-mono text-blue-600">
        <HighlightMatch text={String(value)} query={query} />
      </span>
    );
  if (typeof value === 'string')
    return (
      <span
        className="text-[11px] font-mono text-emerald-700 max-w-[180px] truncate inline-block align-bottom"
        title={value}
      >
        &quot;<HighlightMatch text={value} query={query} />&quot;
      </span>
    );
  if (Array.isArray(value) && value.length === 0)
    return <span className="text-[11px] font-mono text-gray-400">[ ]</span>;
  if (typeof value === 'object' && Object.keys(value).length === 0)
    return <span className="text-[11px] font-mono text-gray-400">{'{}'}</span>;
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
          <span className="text-[11px] font-medium text-gray-600 shrink-0">
            <HighlightMatch text={data.key} query={filterValue} />
          </span>
          <span className="text-[10px] text-gray-300 shrink-0">:</span>
          <ValueChip value={data.value} query={filterValue} />
        </span>
      );
    }
    const count = data.isArray ? data.value.length : Object.keys(data.value ?? {}).length;
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-gray-800">
          <HighlightMatch text={data.key} query={filterValue} />
        </span>
        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1 py-0.5 leading-none">
          {data.isArray ? `[${count}]` : `{${count}}`}
        </span>
      </span>
    );
  }, [filterValue]);

  if (error) {
    return (
      <div className="m-3 p-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg">
        <span className="font-semibold">Parse error:</span> {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 px-4 text-center">
        Select or load a config to view.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Custom search bar with icon on the left */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <div className="relative">
          <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '0.7rem' }} />
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Search keys or values…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
          {filterValue && (
            <button
              type="button"
              onClick={() => setFilterValue('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="pi pi-times" style={{ fontSize: '0.65rem' }} />
            </button>
          )}
        </div>
      </div>
      <Tree
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
          content: { className: 'py-0.5 px-2 rounded hover:bg-gray-50 transition-colors' },
          toggler: { className: 'w-5 h-5 shrink-0 text-gray-400 hover:bg-gray-200 rounded transition-colors' },
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
    <pre className="mt-1.5 text-xs font-mono bg-gray-100 text-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words border border-gray-200">
      <code>{children.trim()}</code>
    </pre>
  );
}

function ReportDocsPanel() {
  return (
    <div className="flex flex-col h-full min-h-0 text-gray-800">
      <div className="shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="text-xs font-semibold text-gray-900">reportConfig reference</div>
        <p className="text-[11px] text-gray-400 mt-0.5">SmartDataProvider + SmartDataTable</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">

        {/* Shape */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Shape</div>
          <CodeBlock>{`{
  api:      { ... },
  table:    { ... },
  controls: [ ... ],
  views:    { ... },
}`}</CodeBlock>
        </section>

        {/* api */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">api</div>
          <CodeBlock>{`api: {
  urlKey: 'myApi',
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
        </section>

        {/* controls */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">controls</div>
          <div className="space-y-1.5">
            {[
              { type: 'dateRange',  desc: 'Date range picker → { start, end }',          ex: "{ key: 'dates',   type: 'dateRange',  label: 'Date Range' }" },
              { type: 'toggle',     desc: 'On/off switch → true | false',                 ex: "{ key: 'active',  type: 'toggle',     label: 'Active only', defaultValue: false }" },
              { type: 'filterSort', desc: 'Filter + sort sidebar → { filters, sort }',    ex: "{ key: 'filters', type: 'filterSort', label: 'Filters' }" },
              { type: 'refresh',    desc: 'Refetch button, shows last-fetched time',       ex: "{ key: 'reload',  type: 'refresh' }" },
            ].map(({ type, desc, ex }) => (
              <details key={type} className="group border border-gray-100 rounded bg-gray-50/40 open:bg-white open:border-gray-200 open:shadow-sm">
                <summary className="cursor-pointer select-none px-2.5 py-1.5 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <i className="pi pi-chevron-right text-[9px] text-gray-400 group-open:rotate-90 transition-transform shrink-0" />
                  <code className="text-[11px] font-mono text-blue-700 shrink-0">{type}</code>
                  <span className="text-[11px] text-gray-500 truncate">{desc}</span>
                </summary>
                <div className="px-2.5 pb-2 border-t border-gray-100">
                  <CodeBlock>{ex}</CodeBlock>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* table */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">table <span className="normal-case font-normal text-gray-400">(all optional, defaults shown)</span></div>
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
              <div key={key} className="flex items-baseline justify-between gap-2 py-1 px-2 rounded hover:bg-gray-50">
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <code className="text-[11px] font-mono text-blue-700">{key}</code>
                  <code className="text-[11px] font-mono text-gray-400">{def}</code>
                </div>
                <span className="text-[11px] text-gray-400 text-right">{note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* context */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Plasmic context</div>
          <p className="text-[11px] text-gray-500 mb-2">
            Bind via <code className="font-mono text-blue-700">data.views.[viewId]</code> in Plasmic Studio.
            Top-level also has <code className="font-mono text-blue-700">fetchedAt</code>.
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
                ],
              },
              {
                key: 'state',
                desc: 'Current view state',
                rows: [
                  ['loading', 'boolean — fetch in progress'],
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
              <details key={key} className="group border border-gray-100 rounded bg-gray-50/40 open:bg-white open:border-gray-200 open:shadow-sm">
                <summary className="cursor-pointer select-none px-2.5 py-1.5 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <i className="pi pi-chevron-right text-[9px] text-gray-400 group-open:rotate-90 transition-transform shrink-0" />
                  <code className="text-[11px] font-mono text-blue-700 shrink-0">{key}</code>
                  <span className="text-[11px] text-gray-500 truncate">{desc}</span>
                </summary>
                <div className="px-2.5 pb-1.5 border-t border-gray-100 space-y-0">
                  {rows.map(([k, note]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 py-0.5 px-1 rounded hover:bg-gray-50">
                      <code className="text-[11px] font-mono text-blue-700 shrink-0">{k}</code>
                      <span className="text-[11px] text-gray-400 text-right">{note}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* views */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">views</div>
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

function ContextPanel() {
  const storeViews = useSmartDataStore(state => state.views);

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
          <span className="text-[11px] font-medium text-gray-600 shrink-0">
            <HighlightMatch text={data.key} query={filterValue} />
          </span>
          <span className="text-[10px] text-gray-300 shrink-0">:</span>
          <ValueChip value={data.value} query={filterValue} />
        </span>
      );
    }
    const count = data.isArray ? data.value.length : Object.keys(data.value ?? {}).length;
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-gray-800">
          <HighlightMatch text={data.key} query={filterValue} />
        </span>
        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1 py-0.5 leading-none">
          {data.isArray ? `[${count}]` : `{${count}}`}
        </span>
      </span>
    );
  }, [filterValue]);

  const hasViews = Object.keys(storeViews).length > 0;

  if (!hasViews) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 px-4 text-center">
        No views registered yet. Load a report config to see context data.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <div className="relative">
          <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '0.7rem' }} />
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Search keys or values…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
          {filterValue && (
            <button
              type="button"
              onClick={() => setFilterValue('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="pi pi-times" style={{ fontSize: '0.65rem' }} />
            </button>
          )}
        </div>
      </div>
      <Tree
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
          content: { className: 'py-0.5 px-2 rounded hover:bg-gray-50 transition-colors' },
          toggler: { className: 'w-5 h-5 shrink-0 text-gray-400 hover:bg-gray-200 rounded transition-colors' },
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
      acceptClassName: 'p-button-danger',
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
        className="shrink-0 p-1 rounded hover:bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        title="Delete"
      >
        <i className="pi pi-trash text-xs" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
      <Toast ref={toast} />
      <ConfirmDialog />

      {/* Config selector header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <i className="pi pi-folder-open text-primary" style={{ fontSize: '0.9rem' }} />
          <span className="font-semibold text-sm text-primary">Config</span>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            value={selectedName}
            onChange={(e) => handleSelect(e.value)}
            options={configs}
            optionLabel="name"
            optionValue="name"
            placeholder="Select a config…"
            className="config-preset-dropdown flex-1 min-w-0"
            panelClassName="preset-dropdown-panel"
            style={{ height: '2rem' }}
            itemTemplate={itemTemplate}
            emptyMessage="No configs yet"
          />
          <button type="button" onClick={handleNew}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors shrink-0"
            title="New config">
            <i className="pi pi-plus text-sm" />
          </button>
          {selectedName && (
            <button type="button" onClick={handleApply}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white transition-colors shrink-0"
              title="Apply">
              <i className="pi pi-play text-sm" />
            </button>
          )}
          {isDirty && selectedName && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors shrink-0"
              title="Save">
              <i className={`pi text-sm ${saving ? 'pi-spin pi-spinner' : 'pi-save'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50/50 shrink-0">
        {[TAB_READ, TAB_EDIT, TAB_DOCS, TAB_CONTEXT].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
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
            <div className="flex items-center justify-center flex-1 text-xs text-gray-400 px-4 text-center">
              Select a config to view
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center flex-1 text-xs text-gray-400">Loading…</div>
          ) : (
            <div className="flex-1 overflow-hidden min-h-0">
              <ReportConfigReadableView configString={liveValueRef.current || seedValue} />
            </div>
          )}
        </div>

        <div className={`absolute inset-0 flex flex-col ${activeTab === TAB_EDIT ? '' : 'hidden'}`}>
          {!selectedName ? (
            <div className="flex items-center justify-center flex-1 text-xs text-gray-400 px-4 text-center">
              Select a config to edit
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center flex-1 text-xs text-gray-400">Loading…</div>
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
