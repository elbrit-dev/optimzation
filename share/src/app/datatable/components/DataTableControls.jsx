'use client';

import { Dropdown } from 'primereact/dropdown';
import Editor from '@monaco-editor/react';
import React, { useMemo, useRef } from 'react';
import { deserializeJsToConfig } from '../config/configSerializer';
import { getOrderedConfigEntries, isEmptyValue } from '../config/configReadableView';

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
      <div className="p-5 text-sm text-red-600 bg-red-50 rounded-lg">
        <span className="font-medium">Parse error:</span> {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-5 text-sm text-gray-500">
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
          <li key={key} className="py-1.5 px-3 space-y-1 border-b border-gray-100 last:border-0">
            <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{label}:</span>
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
        className="text-left w-full text-xs font-mono bg-gray-100 hover:bg-gray-200 rounded px-2 py-1.5 text-gray-800 transition-colors flex items-center gap-1.5"
      >
        <i className={`pi pi-chevron-${expanded ? 'down' : 'right'} text-[10px] shrink-0`} />
        <span className="truncate">{isLong ? firstLine + '…' : code}</span>
      </button>
      {expanded && (
        <pre className="mt-1 text-xs font-mono bg-gray-100 rounded p-2 text-gray-800 whitespace-pre-wrap break-words overflow-visible">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

function ConfigValueDisplay({ value, depth = 0 }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 text-sm"> null</span>;
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
    return <span className="text-sm text-gray-800 break-words"> {value || '(empty)'}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-gray-400"> []</span>;
    return (
      <ul className="list-[circle] list-outside pl-7 mt-1 space-y-0.5 text-sm text-gray-800">
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
    if (entries.length === 0) return <span className="text-sm text-gray-400"> {'{}'}</span>;
    return (
      <ul className="list-[circle] list-outside pl-7 mt-1 space-y-0.5 text-sm">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="text-xs font-medium text-gray-600 mr-1">{k}:</span>
            <ConfigValueDisplay value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-sm"> {String(value)}</span>;
}

export default function DataTableControls({
  codeMode = false,
  onCodeModeToggle,
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
}) {
  const monacoEditorRef = useRef(null);

  const presetItemTemplate = (option) => (
    <div className="flex items-center gap-2 w-full group">
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <i className={`pi ${option.source === 'firebase' ? 'pi-cloud' : 'pi-folder'} text-xs ${option.source === 'firebase' ? 'text-blue-500' : 'text-gray-500'}`}></i>
        <span className="truncate">{option.label}</span>
      </div>
      {option.source === 'firebase' && onDeletePreset && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeletePreset(option.label);
          }}
          className="ml-auto shrink-0 p-1.5 rounded hover:bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete preset"
        >
          <i className="pi pi-trash text-xs"></i>
        </button>
      )}
    </div>
  );

  return (
    <div className={`@container h-full flex flex-col bg-white border-l border-gray-200${codeMode ? '' : ' overflow-y-auto'}`}>
      <div className={`border-b border-gray-200 bg-white hidden ${codeMode ? '@[200px]:flex flex-1 flex-col min-h-0' : '@[200px]:block'}`}>
        <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <i className="pi pi-folder-open text-base @3xs:text-lg text-primary"></i>
              <span className="font-semibold text-sm @3xs:text-base text-primary">Config Presets</span>
            </div>
            {onCodeModeToggle && (
              <button
                onClick={onCodeModeToggle}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${codeMode ? 'bg-primary text-gray-900' : 'text-gray-500 hover:bg-gray-200 hover:text-primary'}`}
                title={codeMode ? 'Switch to readable view' : 'Switch to code view'}
              >
                <i className={`pi text-base ${codeMode ? 'pi-list' : 'pi-code'}`}></i>
              </button>
            )}
          </div>
        </div>

        {codeMode ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-2 @3xs:p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Dropdown
                  value={selectedPresetKey}
                  onChange={(e) => onPresetSelect?.(e.value)}
                  options={presetDropdownOptions}
                  optionLabel="label"
                  optionValue="value"
                  optionGroupLabel="label"
                  optionGroupChildren="items"
                  placeholder="Select a preset..."
                  className="flex-1"
                  style={{ height: '2.5rem' }}
                  panelClassName="preset-dropdown-panel"
                  itemTemplate={presetItemTemplate}
                />
                <button
                  onClick={onCreateNewPreset}
                  className="flex items-center justify-center w-9 h-9 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors shrink-0"
                  title="Create new preset"
                >
                  <i className="pi pi-plus text-sm"></i>
                </button>
              </div>
              {isConfigDirty && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onSavePreset}
                    disabled={presetSaving || !selectedPresetKey}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    <i className={`pi ${presetSaving ? 'pi-spin pi-spinner' : 'pi-save'} text-sm`}></i>
                    Save
                  </button>
                  <button
                    onClick={() => {
                      const editorVal = monacoEditorRef.current?.getModel()?.getValue() ?? '';
                      const toApply = editorVal || presetJsValue;
                      onApplyPreset?.(toApply);
                    }}
                    disabled={!presetJsValue}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    <i className="pi pi-check text-sm"></i>
                    Apply
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 max-h-[calc(100vh-310px)] border-t border-gray-200">
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
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 4,
                  automaticLayout: true,
                  formatOnPaste: true,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="p-2 @3xs:p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Dropdown
                  value={selectedPresetKey}
                  onChange={(e) => onPresetSelect?.(e.value)}
                  options={presetDropdownOptions}
                  optionLabel="label"
                  optionValue="value"
                  optionGroupLabel="label"
                  optionGroupChildren="items"
                  placeholder="Select a preset..."
                  className="flex-1"
                  style={{ height: '2.5rem' }}
                  panelClassName="preset-dropdown-panel"
                  itemTemplate={presetItemTemplate}
                />
                <button
                  onClick={onCreateNewPreset}
                  className="flex items-center justify-center w-9 h-9 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors shrink-0"
                  title="Create new preset"
                >
                  <i className="pi pi-plus text-sm"></i>
                </button>
              </div>
              {isConfigDirty && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onSavePreset}
                    disabled={presetSaving || !selectedPresetKey}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    <i className={`pi ${presetSaving ? 'pi-spin pi-spinner' : 'pi-save'} text-sm`}></i>
                    Save
                  </button>
                  <button
                    onClick={() => onApplyPreset?.(presetJsValue)}
                    disabled={!presetJsValue}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    <i className="pi pi-check text-sm"></i>
                    Apply
                  </button>
                </div>
              )}
            </div>
            <div className="pl-4 border-t border-gray-200">
              <ConfigReadableView presetJsValue={presetJsValue} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
