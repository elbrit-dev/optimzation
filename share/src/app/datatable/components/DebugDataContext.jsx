'use client';

import { flatMap, isArray, uniq } from 'lodash';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Button } from '@/design-system';
import { InputText } from 'primereact/inputtext';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Checkbox } from 'primereact/checkbox';
import { useSlotId } from './DataSlot';
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

  const allKeysFromArray = useMemo(() => {
    if (!isArray(value)) return null;
    const keys = uniq(flatMap(value, (item) =>
      item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item) : []
    ));
    return keys;
  }, [value]);

  if (value === null) return <span className="text-ds-secondary">null</span>;
  if (typeof value === 'function') {
    return (
      <span className="text-cat-violet text-sm font-mono">[Function: {keyName}]</span>
    );
  }
  if (typeof value !== 'object') {
    const str = String(value);
    const display = str.length > MAX_STRING_LENGTH ? str.slice(0, MAX_STRING_LENGTH) + '…' : str;
    return <span className="text-body font-mono text-sm">{display}</span>;
  }

  if (Array.isArray(value)) {
    const len = value.length;
    const showFull = expanded || len <= PREVIEW_ITEMS;
    const slice = value.slice(0, showFull ? len : PREVIEW_ITEMS);

    return (
      <div className="ml-2 border-l border-line-subtle pl-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ds-secondary text-xs">length: {len}</span>
          {allKeysFromArray && allKeysFromArray.length > 0 && (
            <span className="text-ds-secondary text-xs">{allKeysFromArray.length} keys (all rows)</span>
          )}
          {len > PREVIEW_ITEMS && (
            <Button type="link" size="sm" className="p-0 text-xs" onClick={() => setExpanded(e => !e)}>{expanded ? 'Collapse' : `Show ${len - PREVIEW_ITEMS} more`}</Button>
          )}
          <Button type="link" size="sm" className="p-0 text-xs" onClick={handleCopy}>{copyFeedback ? 'Copied!' : 'Copy'}</Button>
        </div>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          {slice.map((item, i) => (
            <li key={i} className="text-sm">
              {typeof item === 'object' && item !== null && !Array.isArray(item) ? (
                <ValuePreview value={item} keyName={`[${i}]`} depth={depth + 1} />
              ) : (
                <span className="font-mono text-body">
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
    <div className="ml-2 border-l border-line-subtle pl-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-ds-secondary text-xs">{keys.length} keys</span>
        {keys.length > 8 && (
          <Button type="link" size="sm" className="p-0 text-xs" onClick={() => setExpanded(e => !e)}>{expanded ? 'Collapse' : `Show ${keys.length - 8} more`}</Button>
        )}
        <Button type="link" size="sm" className="p-0 text-xs" onClick={handleCopy}>{copyFeedback ? 'Copied!' : 'Copy'}</Button>
      </div>
      {depth < 2 && (
        <ul className="mt-1 space-y-1">
          {displayKeys.map(k => (
            <li key={k} className="text-sm">
              <span className="font-medium text-body">{k}: </span>
              <ValuePreview value={value[k]} keyName={k} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
      {depth >= 2 && (
        <pre className="text-xs text-ds-secondary mt-1 overflow-auto max-h-40">{JSON.stringify(value, null, 1).slice(0, 500)}{JSON.stringify(value).length > 500 ? '…' : ''}</pre>
      )}
    </div>
  );
}

function KeyRow({ contextKey, value, searchTerm, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const handleCopyKey = useCallback((e) => {
    e.stopPropagation();
    const str = serializeForCopy(value, contextKey);
    navigator.clipboard.writeText(str).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [value, contextKey]);

  const keyLower = contextKey.toLowerCase();
  const term = (searchTerm || '').toLowerCase();
  if (term && !keyLower.includes(term)) return null;

  const typeLabel = getTypeLabel(value);
  const category = getCategory(contextKey, value);

  return (
    <div className="border-b border-line-subtle last:border-0">
      <div className="flex items-center gap-2 py-2 px-2 hover:bg-brand-tint-weak group">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <i className={`pi flex-shrink-0 text-ds-secondary text-xs ${expanded ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
          <span className="font-mono font-medium text-body">{contextKey}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-sunken text-ds-secondary">{typeLabel}</span>
          {category === 'data' && <span className="text-xs px-1.5 py-0.5 rounded bg-brand-tint text-brand">Data</span>}
          {category === 'state' && <span className="text-xs px-1.5 py-0.5 rounded bg-warning-wash text-warning">State</span>}
          {category === 'functions' && typeof value === 'function' && <span className="text-xs px-1.5 py-0.5 rounded bg-cat-violet-wash text-cat-violet">Function</span>}
        </button>
        <Button type="link" size="sm" icon={<i className="pi pi-copy" />} className="flex-shrink-0 text-xs py-1 px-2" onClick={handleCopyKey} title={`Copy ${contextKey}`}>{copyFeedback ? 'Copied!' : 'Copy'}</Button>
      </div>
      {expanded && (
        <div className="pl-6 pr-2 pb-2 pt-0 bg-sunken/50">
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
  const rawContext = useContext(TableOperationsContext);
  const currentSlotId = useSlotId() ?? 'main';
  const isSlotSystem = rawContext && rawContext.rawData === undefined && typeof rawContext.main === 'object';

  const { ctx, slotEntries } = useMemo(() => {
    if (!rawContext) return { ctx: null, slotEntries: [] };
    if (!isSlotSystem) return { ctx: rawContext, slotEntries: [] };
    const slotIds = Object.keys(rawContext);
    const entries = slotIds.map((slotId) => {
      const slotCtx = rawContext[slotId];
      return { slotId, ctx: slotCtx, categories: categorizeKeys(slotCtx) };
    });
    const ctxForCurrent = rawContext[currentSlotId];
    return { ctx: ctxForCurrent ?? entries[0]?.ctx ?? null, slotEntries: entries };
  }, [rawContext, currentSlotId, isSlotSystem]);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [searchTerm, setSearchTerm] = useState('');

  const categories = useMemo(() => categorizeKeys(ctx), [ctx]);

  const handleCopyFull = useCallback(() => {
    if (!ctx) return;
    const str = serializeForCopy(ctx, 'context');
    navigator.clipboard.writeText(str);
  }, [ctx]);

  const handleCopySlot = useCallback((slotCtx, slotId) => {
    if (!slotCtx) return;
    const str = serializeForCopy(slotCtx, `context-slot-${slotId}`);
    navigator.clipboard.writeText(str);
  }, []);

  if (ctx === null || ctx === undefined) {
    return (
      <div className="px-3 py-2 bg-surface-disabled text-ds-secondary text-sm rounded border border-line">
        Debug: No table context (use inside DataProvider).
      </div>
    );
  }

  return (
    <div className="mb-4 border border-line-subtle rounded-lg bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-sunken hover:bg-brand-tint-weak border-b border-line-subtle text-left"
      >
        <span className="font-semibold text-body">
          Table context debug
          {isSlotSystem && (
            <span className="ml-2 text-xs font-normal text-ds-secondary">
              (Slots: {Object.keys(rawContext ?? {}).join(', ') || '—'} | Current: {currentSlotId})
            </span>
          )}
        </span>
        <i className={`pi ${collapsed ? 'pi-chevron-down' : 'pi-chevron-up'} text-ds-secondary`} />
      </button>
      {!collapsed && (
        <div className="p-4 max-h-[70vh] flex flex-col min-h-0">
          {typeof onHideTableChange === 'function' && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-sunken rounded">
              <Checkbox
                unstyled
                inputId="hide-table"
                checked={hideTable}
                onChange={e => onHideTableChange(!!e.checked)}
              />
              <label htmlFor="hide-table" className="text-sm cursor-pointer">Hide table</label>
            </div>
          )}

          <InputText
unstyled
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter keys..."
            className="w-full mb-3"
          />

          {!isSlotSystem && (
            <Button icon={<i className="pi pi-copy" />} className="w-full mb-3" onClick={handleCopyFull}>Copy full context as JSON</Button>
          )}

          <div className="overflow-auto min-h-0 flex-1 border border-line-subtle rounded">
            <Accordion
unstyled
              multiple
              activeIndex={
                isSlotSystem
                  ? Array.from({ length: 1 + slotEntries.length }, (_, i) => i)
                  : [0, 1, 2]
              }
            >
              {isSlotSystem && (
                <AccordionTab unstyled header="Slot system">
                  <div className="space-y-2 p-2">
                    <div>
                      <span className="font-medium text-body">slotIds: </span>
                      <pre className="text-sm font-mono bg-sunken p-2 rounded mt-1">
                        {JSON.stringify(Object.keys(rawContext ?? {}), null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium text-body">Current slot (from useSlotId): </span>
                      <span className="font-mono text-body">{currentSlotId}</span>
                    </div>
                    {slotEntries.length === 0 && (
                      <p className="text-warning text-sm mt-2">No slots defined (slotIds empty or invalid).</p>
                    )}
                    <Button size="sm" icon={<i className="pi pi-copy" />} className="mt-2" onClick={() => navigator.clipboard.writeText(JSON.stringify(rawContext?.slotIds ?? [], null, 2))}>Copy slotIds</Button>
                  </div>
                </AccordionTab>
              )}
              {isSlotSystem && slotEntries.length > 0
                ? slotEntries.map(({ slotId, ctx: slotCtx, categories: slotCats }, idx) => (
                    <AccordionTab
unstyled
                      key={slotId}
                      header={
                        <span className="flex items-center justify-between gap-2 w-full pr-2">
                          <span className="flex items-center gap-2">
                            Slot: {slotId}
                            {slotId === currentSlotId && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-brand-tint text-brand">current</span>
                            )}
                          </span>
                          <Button type="link" size="sm" icon={<i className="pi pi-copy" />} className="flex-shrink-0 text-xs py-1 px-2" onClick={(e) => {
                              e.stopPropagation();
                              handleCopySlot(slotCtx, slotId);
                            }} title="Copy this slot context as JSON">Copy</Button>
                        </span>
                      }
                    >
                      <div className="space-y-2">
                        <Accordion unstyled multiple activeIndex={[0, 1, 2]}>
                          <AccordionTab unstyled header={`Data (${slotCats.data.length})`}>
                            <div className="space-y-0">
                              {slotCats.data.map(k => (
                                <KeyRow key={k} contextKey={k} value={slotCtx[k]} searchTerm={searchTerm} />
                              ))}
                              {slotCats.data.length === 0 && <p className="text-ds-secondary text-sm">No data keys</p>}
                            </div>
                          </AccordionTab>
                          <AccordionTab unstyled header={`State (${slotCats.state.length})`}>
                            <div className="space-y-0">
                              {slotCats.state.map(k => (
                                <KeyRow key={k} contextKey={k} value={slotCtx[k]} searchTerm={searchTerm} />
                              ))}
                              {slotCats.state.length === 0 && <p className="text-ds-secondary text-sm">No state keys</p>}
                            </div>
                          </AccordionTab>
                          <AccordionTab unstyled header={`Functions (${slotCats.functions.length})`}>
                            <div className="space-y-0">
                              {slotCats.functions.map(k => (
                                <KeyRow key={k} contextKey={k} value={slotCtx[k]} searchTerm={searchTerm} />
                              ))}
                              {slotCats.functions.length === 0 && <p className="text-ds-secondary text-sm">No function keys</p>}
                            </div>
                          </AccordionTab>
                        </Accordion>
                      </div>
                    </AccordionTab>
                  ))
                : !isSlotSystem && (
                    <>
                      <AccordionTab unstyled header={`Data (${categories.data.length})`}>
                        <div className="space-y-0">
                          {categories.data.map(k => (
                            <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                          ))}
                          {categories.data.length === 0 && <p className="text-ds-secondary text-sm">No data keys</p>}
                        </div>
                      </AccordionTab>
                      <AccordionTab unstyled header={`State (${categories.state.length})`}>
                        <div className="space-y-0">
                          {categories.state.map(k => (
                            <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                          ))}
                          {categories.state.length === 0 && <p className="text-ds-secondary text-sm">No state keys</p>}
                        </div>
                      </AccordionTab>
                      <AccordionTab unstyled header={`Functions (${categories.functions.length})`}>
                        <div className="space-y-0">
                          {categories.functions.map(k => (
                            <KeyRow key={k} contextKey={k} value={ctx[k]} searchTerm={searchTerm} />
                          ))}
                          {categories.functions.length === 0 && <p className="text-ds-secondary text-sm">No function keys</p>}
                        </div>
                      </AccordionTab>
                    </>
                  )}
            </Accordion>
          </div>
        </div>
      )}
    </div>
  );
}
