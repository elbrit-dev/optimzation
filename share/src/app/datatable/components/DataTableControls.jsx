'use client';

import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import { flatMap, isEmpty, uniq } from 'lodash';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import Editor from '@monaco-editor/react';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTableOperations } from '../contexts/TableOperationsContext';
import { deserializeJsToConfig } from '../config/configSerializer';
import { getOrderedConfigEntries, isEmptyValue } from '../config/configReadableView';
import { getDataKeys } from '../utils/dataAccessUtils';
import DatatableDocsPanel from './DatatableDocsPanel';
import { Button } from '@/design-system';

function ConfigReadableView({ presetJsValue }) {
  const { config, error } = useMemo(() => {
    if (!presetJsValue || !presetJsValue.trim()) {
      return { config: null, error: null };
    }
    try {
      const parsed = deserializeJsToConfig(presetJsValue);
      return { config: parsed, error: null };
    } catch (err) {
      return { config: null, error: err?.message ?? 'Invalid config' };
    }
  }, [presetJsValue]);

  if (error) {
    return (
      <div className="p-5 text-sm text-danger bg-danger-wash rounded-lg">
        <span className="font-medium">Parse error:</span> {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-5 text-sm text-ds-secondary">
        Select or load a preset to view config.
      </div>
    );
  }

  const entries = getOrderedConfigEntries(config);

  return (
    <ul className="p-4 @3xs:p-5 list-disc list-outside pl-7 space-y-1.5 leading-relaxed overflow-y-auto max-h-[calc(100vh-280px)]">
      {entries.map(({ key, label, value }) => {
        if (isEmptyValue(value)) return null;

        return (
          <li key={key} className="py-1.5 px-3 space-y-1 border-b border-line-subtle last:border-0">
            <span className="text-sm font-semibold text-body uppercase tracking-wide">{label}:</span>
            <ConfigValueDisplay value={value} />
          </li>
        );
      })}
    </ul>
  );
}

function FunctionCodeBlock({ value }) {
  const [expanded, setExpanded] = React.useState(false);
  const code = value.toString();
  const firstLine = code.split('\n')[0];
  const isLong = code.includes('\n') || code.length > 60;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-left w-full text-xs font-mono bg-sunken hover:bg-brand-tint rounded px-2 py-1.5 text-body transition-colors flex items-center gap-1.5"
      >
        <i className={`pi pi-chevron-${expanded ? 'down' : 'right'} text-10 shrink-0`} />
        <span className="truncate">{isLong ? firstLine + '…' : code}</span>
      </button>
      {expanded && (
        <pre className="mt-1 text-xs font-mono bg-sunken rounded p-2 text-body whitespace-pre-wrap break-words overflow-visible">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

function ConfigValueDisplay({ value, depth = 0 }) {
  if (value === null || value === undefined) {
    return <span className="text-ds-muted text-sm"> null</span>;
  }
  if (typeof value === 'function') {
    return <FunctionCodeBlock value={value} />;
  }
  if (typeof value === 'boolean') {
    return <span className="text-sm font-mono"> {value ? 'true' : 'false'}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-sm font-mono"> {value}</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-sm text-body break-words"> {value || '(empty)'}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-ds-muted"> []</span>;
    return (
      <ul className="list-[circle] list-outside pl-7 mt-1 space-y-0.5 text-sm text-body">
        {value.map((item, i) => (
          <li key={i}>
            {(typeof item === 'object' && item !== null && !Array.isArray(item)) || typeof item === 'function' ? (
              <ConfigValueDisplay value={item} depth={depth + 1} />
            ) : (
              String(item)
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="text-sm text-ds-muted"> {'{}'}</span>;
    return (
      <ul className="list-[circle] list-outside pl-7 mt-1 space-y-0.5 text-sm">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="text-xs font-medium text-ds-secondary mr-1">{k}:</span>
            <ConfigValueDisplay value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-sm"> {String(value)}</span>;
}

function ColumnNamesList({ columns = [] }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return columns;
    const q = search.trim().toLowerCase();
    return columns.filter((c) => String(c).toLowerCase().includes(q));
  }, [columns, search]);

  const copyToClipboard = useCallback(async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyAll = useCallback(() => {
    copyToClipboard(filtered.join(', '));
  }, [filtered, copyToClipboard]);

  const handleCopyMatching = useCallback(() => {
    if (!search.trim()) return;
    copyToClipboard(filtered.join(', '));
  }, [search, filtered, copyToClipboard]);

  const handleCopyOne = useCallback(
    (col) => {
      copyToClipboard(col);
    },
    [copyToClipboard]
  );

  if (columns.length === 0) {
    return (
      <div className="p-5 text-sm text-ds-secondary">
        No column names available. Load data first.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 @3xs:p-4 space-y-2 border-b border-line-subtle">
        <div className="flex flex-wrap gap-2 items-center">
          <InputText
unstyled
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search columns..."
            className="flex-1 min-w-[120px] text-sm"
            style={{ height: 'var(--control-h)' }}
          />
          <Button type="default" size="sm" onClick={handleCopyAll}>
            Copy all
          </Button>
          {search.trim() && (
            <Button type="default" size="sm" onClick={handleCopyMatching}>
              Copy matching
            </Button>
          )}
        </div>
        <div className="text-xs text-ds-secondary">
          Showing {filtered.length} of {columns.length} columns
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 @3xs:p-4 space-y-1 max-h-[calc(100vh-320px)]">
        {filtered.map((col) => (
          <li
            key={col}
            className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-brand-tint-weak group"
          >
            <code className="text-sm font-mono text-body truncate">{col}</code>
            <button
              type="button"
              onClick={() => handleCopyOne(col)}
              className="shrink-0 p-1.5 rounded text-ds-muted hover:bg-brand-tint hover:text-body transition-colors"
              title="Copy"
            >
              <i className="pi pi-copy text-xs"></i>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TAB_READ = 'read';
const TAB_EDIT = 'edit';
const TAB_INFO = 'info';
const TAB_DOCS = 'docs';

export default function DataTableControls({
  config,
  dataSource = null,
  onDataSourceChange,
  presetDropdownOptions = [],
  selectedPresetKey = null,
  onPresetSelect,
  presetJsValue = '',
  onPresetJsChange,
  onSavePreset,
  onApplyPreset,
  onCreateNewPreset,
  onDeletePreset,
  presetSaving = false,
  isConfigDirty = false,
  overridesDraft = '',
  onOverridesDraftChange,
  providerOverrides = undefined,
  onApplyOverrides,
  onClearOverrides,
}) {
  const slotIdForData = (config?.slots && Object.keys(config.slots)[0]) ?? 'main';
  const tableOps = useTableOperations(slotIdForData);
  const { rawData } = tableOps;

  const allColumnNames = useMemo(() => {
    if (!Array.isArray(rawData) || isEmpty(rawData)) return [];
    return uniq(flatMap(rawData, (item) =>
      item && typeof item === 'object' ? getDataKeys(item).filter(k => k && typeof k === 'string' && !k.startsWith('__')) : []
    )).sort();
  }, [rawData]);

  const [savedQueries, setSavedQueries] = useState([]);
  useEffect(() => {
    queryRegistry.getAllQueries().then(setSavedQueries).catch((err) => {
      console.error('Failed to load saved queries:', err?.code || err?.message || err, err);
      setSavedQueries([]);
    });
  }, []);
  const dataSourceOptions = useMemo(() => savedQueries.filter((q) => !q._offline), [savedQueries]);
  const monacoEditorRef = useRef(null);
  const [activeTab, setActiveTab] = useState(TAB_READ);

  const presetItemTemplate = (option) => (
    <div className="flex items-center gap-2 w-full group">
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <i className={`pi ${option.source === 'firebase' ? 'pi-cloud' : 'pi-folder'} text-xs ${option.source === 'firebase' ? 'text-brand' : 'text-ds-secondary'}`}></i>
        <span className="truncate">{option.label}</span>
      </div>
      {option.source === 'firebase' && onDeletePreset && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeletePreset(option.label);
          }}
          className="ml-auto shrink-0 p-1.5 rounded hover:bg-danger-wash text-danger opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete preset"
        >
          <i className="pi pi-trash text-xs"></i>
        </button>
      )}
    </div>
  );

  const isEditTab = activeTab === TAB_EDIT;
  const showSaveApply = (activeTab === TAB_READ || activeTab === TAB_EDIT) && isConfigDirty;

  return (
    <div className="@container h-full flex flex-col bg-surface border-l border-line-subtle">
      <div className="border-b border-line-subtle bg-surface hidden @[200px]:flex flex-1 flex-col min-h-0 overflow-hidden">
        <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-sunken border-b border-line-subtle space-y-2">
          <div className="flex items-center gap-2">
            <i className="pi pi-database text-base @3xs:text-lg text-primary"></i>
            <span className="font-semibold text-sm @3xs:text-base text-primary">DataSource</span>
          </div>
          <div className="flex items-center gap-2">
            <Dropdown
unstyled
              value={dataSource}
              onChange={(e) => onDataSourceChange?.(e.value)}
              options={dataSourceOptions}
              optionLabel="name"
              optionValue="id"
              placeholder="Select data source..."
              className="config-preset-dropdown flex-1 min-w-0"
              style={{ height: 'var(--control-h)' }}
              disabled={!dataSourceOptions?.length}
            />
          </div>
          <div className="flex items-center gap-2">
            <i className="pi pi-sliders-h text-base @3xs:text-lg text-primary"></i>
            <span className="font-semibold text-sm @3xs:text-base text-primary">Overrides</span>
            {providerOverrides && Object.keys(providerOverrides).length > 0 && (
              <span className="text-10 font-medium px-1.5 py-0.5 rounded bg-success-wash text-success">Active</span>
            )}
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={overridesDraft}
              onChange={(e) => onOverridesDraftChange?.(e.target.value)}
              placeholder={'DataProvider overrides — e.g.\n{ "token": "Bearer ...", "variables": { "region": "IN" } }'}
              className="flex-1 min-w-0 text-xs font-mono border border-line rounded px-2 py-1.5 resize-y"
              rows={3}
              title="Passed as-is to <DataProvider overrides={...}>: token, variables, and (non-preset flows only) config"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={onApplyOverrides}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand transition-colors"
                title="Apply overrides"
              >
                <i className="pi pi-check text-sm"></i>
              </button>
              {providerOverrides && Object.keys(providerOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={onClearOverrides}
                  className="flex items-center justify-center h-control aspect-square rounded-md border transition-colors bg-surface border-line-subtle text-body hover:border-brand-hover hover:text-brand-hover"
                  title="Clear overrides"
                >
                  <i className="pi pi-times text-sm"></i>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <i className="pi pi-folder-open text-base @3xs:text-lg text-primary"></i>
            <span className="font-semibold text-sm @3xs:text-base text-primary">Config</span>
          </div>
          <div className="flex items-center gap-2">
            <Dropdown
unstyled
              value={selectedPresetKey}
              onChange={(e) => onPresetSelect?.(e.value)}
              options={presetDropdownOptions}
              optionLabel="label"
              optionValue="value"
              optionGroupLabel="label"
              optionGroupChildren="items"
              placeholder="Select a preset..."
              className="config-preset-dropdown flex-1 min-w-0"
              style={{ height: 'var(--control-h)' }}
              panelClassName="preset-dropdown-panel"
              itemTemplate={presetItemTemplate}
            />
            <button
              onClick={onCreateNewPreset}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand transition-colors shrink-0"
              title="Create new preset"
            >
              <i className="pi pi-plus text-sm"></i>
            </button>
            {showSaveApply && (
              <>
                <button
                  onClick={onSavePreset}
                  disabled={presetSaving || !selectedPresetKey}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand disabled:bg-surface-disabled disabled:cursor-not-allowed transition-colors shrink-0"
                  title="Save"
                >
                  <i className={`pi text-sm ${presetSaving ? 'pi-spin pi-spinner' : 'pi-save'}`}></i>
                </button>
                <button
                  onClick={() => {
                    const editorVal = isEditTab ? monacoEditorRef.current?.getModel()?.getValue() ?? '' : '';
                    const toApply = editorVal || presetJsValue;
                    onApplyPreset?.(toApply);
                  }}
                  disabled={!presetJsValue}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-brand hover:bg-brand-hover text-on-brand disabled:bg-surface-disabled disabled:cursor-not-allowed transition-colors shrink-0"
                  title="Apply"
                >
                  <i className="pi pi-check text-sm"></i>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-2 @3xs:px-4 py-2 border-b border-line-subtle bg-sunken/50">
          <button
            type="button"
            onClick={() => setActiveTab(TAB_READ)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${activeTab === TAB_READ ? 'bg-brand-fill text-on-brand' : 'text-ds-secondary hover:bg-brand-tint'}`}
          >
            Config Read
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TAB_EDIT)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${activeTab === TAB_EDIT ? 'bg-brand-fill text-on-brand' : 'text-ds-secondary hover:bg-brand-tint'}`}
          >
            Config Edit
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TAB_INFO)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${activeTab === TAB_INFO ? 'bg-brand-fill text-on-brand' : 'text-ds-secondary hover:bg-brand-tint'}`}
          >
            Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TAB_DOCS)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${activeTab === TAB_DOCS ? 'bg-brand-fill text-on-brand' : 'text-ds-secondary hover:bg-brand-tint'}`}
          >
            Docs
          </button>
        </div>

        {activeTab === TAB_READ && (
          <div className="pl-4 flex-1 overflow-y-auto min-h-0">
            <ConfigReadableView presetJsValue={presetJsValue} />
          </div>
        )}

        {activeTab === TAB_EDIT && (
          <div className="flex-1 flex flex-col min-h-0 max-h-[calc(100vh-310px)]">
            <Editor
              key={selectedPresetKey}
              height="100%"
              defaultLanguage="javascript"
              defaultValue={presetJsValue}
              onMount={(editor) => { monacoEditorRef.current = editor; }}
              onChange={(val) => onPresetJsChange?.(val ?? '')}
              theme="vs"
              options={{
                minimap: { enabled: false },
                fontSize: 'var(--fs-13)',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 4,
                automaticLayout: true,
                formatOnPaste: true,
              }}
            />
          </div>
        )}

        {activeTab === TAB_INFO && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ColumnNamesList columns={allColumnNames} />
          </div>
        )}

        {activeTab === TAB_DOCS && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <DatatableDocsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
