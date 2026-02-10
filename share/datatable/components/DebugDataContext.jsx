'use client';

import { useCallback, useContext, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Checkbox } from 'primereact/checkbox';
import { TableOperationsContext } from '../contexts/TableOperationsContext';

const PREVIEW_ITEMS = 5;
const MAX_STRING_LENGTH = 80;

// Keys we treat as "Data" (arrays / data sets) for grouping
const DATA_KEYS = new Set([
  'rawData', 'filteredData', 'groupedData', 'sortedData', 'paginatedData',
  'columns', 'reportData', 'filterOptions', 'optionColumnValues',
]);

function getCategory(key, value) {
  if (DATA_KEYS.has(key)) return 'data';
  if (typeof value === 'function') return 'functions';
  return 'state';
}

function serializeForCopy(value, key) {
  const seen = new WeakSet();
  function replacer(k, v) {
    if (typeof v === 'function') return `[Function: ${k ?? key}]`;
    if (v === undefined) return '[undefined]';
    if (typeof v === 'symbol') return String(v);
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  }
  return JSON.stringify(value, replacer, 2);
}

function getTypeLabel(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array (${value.length})`;
  if (typeof value === 'function') return 'function';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function ValuePreview({ value, keyName, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = useCallback(() => {
    const str = serializeForCopy(value, keyName);
    navigator.clipboard.writeText(str).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [value, keyName]);

  if (value === null) return <span className="text-gray-500">null</span>;
  if (typeof value === 'function') {
    return (
      <span className="text-purple-600 text-sm font-mono">[Function: {keyName}]</span>
    );
  }
  if (typeof value !== 'object') {
    const str = String(value);
    const display = str.length > MAX_STRING_LENGTH ? str.slice(0, MAX_STRING_LENGTH) + '…' : str;
    return <span className="text-gray-800 font-mono text-sm">{display}</span>;
  }

  if (Array.isArray(value)) {
    const len = value.length;
    const showFull = expanded || len <= PREVIEW_ITEMS;
    const slice = value.slice(0, showFull ? len : PREVIEW_ITEMS);

    return (
      <div className="ml-2 border-l border-gray-200 pl-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-500 text-xs">length: {len}</span>
          {len > PREVIEW_ITEMS && (
            <Button
              type="button"
              label={expanded ? 'Collapse' : `Show ${len - PREVIEW_ITEMS} more`}
              link
              size="small"
              className="p-0 text-xs"
              onClick={() => setExpanded(e => !e)}
            />
          )}
          <Button type="button" label={copyFeedback ? 'Copied!' : 'Copy'} link size="small" className="p-0 text-xs" onClick={handleCopy} />
        </div>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          {slice.map((item, i) => (
            <li key={i} className="text-sm">
              {typeof item === 'object' && item !== null && !Array.isArray(item) ? (
                <ValuePreview value={item} keyName={`[${i}]`} depth={depth + 1} />
              ) : (
                <span className="font-mono text-gray-700">
                  {typeof item === 'object' ? JSON.stringify(item).slice(0, 60) + (JSON.stringify(item).length > 60 ? '…' : '') : String(item)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Plain object
  const keys = Object.keys(value);
  const showFull = expanded || keys.length <= 8;
  const displayKeys = showFull ? keys : keys.slice(0, 8);

  return (
    <div className="ml-2 border-l border-gray-200 pl-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-500 text-xs">{keys.length} keys</span>
        {keys.length > 8 && (
          <Button
            type="button"
            label={expanded ? 'Collapse' : `Show ${keys.length - 8} more`}
            link
            size="small"
            className="p-0 text-xs"
            onClick={() => setExpanded(e => !e)}
          />
        )}
        <Button type="button" label={copyFeedback ? 'Copied!' : 'Copy'} link size="small" className="p-0 text-xs" onClick={handleCopy} />
      </div>
      {depth < 2 && (
        <ul className="mt-1 space-y-1">
          {displayKeys.map(k => (
            <li key={k} className="text-sm">
              <span className="font-medium text-gray-700">{k}: </span>
              <ValuePreview value={value[k]} keyName={k} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
      {depth >= 2 && (
        <pre className="text-xs text-gray-600 mt-1 overflow-auto max-h-40">{JSON.stringify(value, null, 1).slice(0, 500)}{JSON.stringify(value).length > 500 ? '…' : ''}</pre>
      )}
    </div>
  );
}

function KeyRow({ contextKey, value, searchTerm, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const keyLower = contextKey.toLowerCase();
  const term = (searchTerm || '').toLowerCase();
  if (term && !keyLower.includes(term)) return null;

  const typeLabel = getTypeLabel(value);
  const category = getCategory(contextKey, value);

  const handleCopyKey = useCallback((e) => {
    e.stopPropagation();
    const str = serializeForCopy(value, contextKey);
    navigator.clipboard.writeText(str).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [value, contextKey]);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 py-2 px-2 hover:bg-gray-50 group">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <i className={`pi flex-shrink-0 text-gray-500 text-xs ${expanded ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
          <span className="font-mono font-medium text-gray-800">{contextKey}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{typeLabel}</span>
          {category === 'data' && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Data</span>}
          {category === 'state' && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">State</span>}
          {category === 'functions' && typeof value === 'function' && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Function</span>}
        </button>
        <Button
          type="button"
          icon="pi pi-copy"
          label={copyFeedback ? 'Copied!' : 'Copy'}
          link
          size="small"
          className="flex-shrink-0 text-xs py-1 px-2"
          onClick={handleCopyKey}
          title={`Copy ${contextKey}`}
        />
      </div>
      {expanded && (
        <div className="pl-6 pr-2 pb-2 pt-0 bg-gray-50/50">
          <ValuePreview value={value} keyName={contextKey} />
        </div>
      )}
    </div>
  );
}

function categorizeKeys(ctx) {
  const data = [];
  const state = [];
  const functions = [];
  if (!ctx || typeof ctx !== 'object') return { data, state, functions };
  Object.keys(ctx).forEach(k => {
    const v = ctx[k];
    const cat = getCategory(k, v);
    if (cat === 'data') data.push(k);
    else if (cat === 'state') state.push(k);
    else functions.push(k);
  });
  return { data, state, functions };
}

export default function DebugDataContext({
  hideTable = false,
  onHideTableChange,
  defaultCollapsed = false,
}) {
  const ctx = useContext(TableOperationsContext);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [searchTerm, setSearchTerm] = useState('');

  const categories = useMemo(() => categorizeKeys(ctx), [ctx]);

  const handleCopyFull = useCallback(() => {
    if (!ctx) return;
    const str = serializeForCopy(ctx, 'context');
    navigator.clipboard.writeText(str);
  }, [ctx]);

  if (ctx === null || ctx === undefined) {
    return (
      <div className="px-3 py-2 bg-gray-200 text-gray-600 text-sm rounded border border-gray-300">
        Debug: No table context (use inside DataProvider).
      </div>
    );
  }

  return (
    <div className="mb-4 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 text-left"
      >
        <span className="font-semibold text-gray-800">Table context debug</span>
        <i className={`pi ${collapsed ? 'pi-chevron-down' : 'pi-chevron-up'} text-gray-500`} />
      </button>
      {!collapsed && (
        <div className="p-4 max-h-[70vh] flex flex-col min-h-0">
          {typeof onHideTableChange === 'function' && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded">
              <Checkbox
                inputId="hide-table"
                checked={hideTable}
                onChange={e => onHideTableChange(!!e.checked)}
              />
              <label htmlFor="hide-table" className="text-sm cursor-pointer">Hide table</label>
            </div>
          )}

          <InputText
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter keys..."
            className="w-full mb-3"
          />

          <Button label="Copy full context as JSON" icon="pi pi-copy" className="w-full mb-3" onClick={handleCopyFull} />

          <div className="overflow-auto min-h-0 flex-1 border border-gray-100 rounded">
            <Accordion multiple activeIndex={[0, 1, 2]}>
              <AccordionTab header={`Data (${categories.data.length})`}>
                <div className="space-y-0">
                  {categories.data.map(k => (
                    <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                  ))}
                  {categories.data.length === 0 && <p className="text-gray-500 text-sm">No data keys</p>}
                </div>
              </AccordionTab>
              <AccordionTab header={`State (${categories.state.length})`}>
                <div className="space-y-0">
                  {categories.state.map(k => (
                    <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                  ))}
                  {categories.state.length === 0 && <p className="text-gray-500 text-sm">No state keys</p>}
                </div>
              </AccordionTab>
              <AccordionTab header={`Functions (${categories.functions.length})`}>
                <div className="space-y-0">
                  {categories.functions.map(k => (
                    <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                  ))}
                  {categories.functions.length === 0 && <p className="text-gray-500 text-sm">No function keys</p>}
                </div>
              </AccordionTab>
            </Accordion>
          </div>
        </div>
      )}
    </div>
  );
}
