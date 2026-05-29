'use client';

import Editor from '@monaco-editor/react';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { Toast } from 'primereact/toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';

const EXCLUDED_IDS = new Set(['#__ID__#']);

function configureMonaco(monaco) {
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
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

export default function ReportsConfigSidebar({ onConfigLoad }) {
  const toast      = useRef(null);
  const editorRef  = useRef(null);
  const savedRef   = useRef(''); // tracks last-Firestore value for dirty detection

  const [configs,       setConfigs]       = useState([]);
  const [selectedName,  setSelectedName]  = useState(null);
  const [seedValue,     setSeedValue]     = useState(''); // defaultValue for fresh editor mount
  const [isDirty,       setIsDirty]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    firestoreService
      .loadAllReports()
      .then((all) => setConfigs(all.filter((c) => !EXCLUDED_IDS.has(c.name))))
      .catch(console.error);
  }, []);

  async function formatEditor() {
    const editor = editorRef.current;
    if (!editor) return null;
    try { await editor.getAction('editor.action.formatDocument').run(); } catch { /* syntax error */ }
    return editor.getValue();
  }

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() =>
      setIsDirty(editor.getValue() !== savedRef.current)
    );
  }, []);

  const handleSelect = useCallback(async (name) => {
    if (!name || name === selectedName) return;
    setLoading(true);
    setSelectedName(name);
    try {
      const config = await firestoreService.loadReport(name);
      savedRef.current = config;
      setSeedValue(config); // feeds defaultValue when editor remounts via key change
      setIsDirty(false);
      onConfigLoad?.(config);
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

  const handleApply = useCallback(async () => {
    const value = await formatEditor() ?? editorRef.current?.getValue() ?? '';
    onConfigLoad?.(value);
  }, [onConfigLoad]);

  const handleSave = useCallback(async () => {
    if (!selectedName) return;
    setSaving(true);
    try {
      const formatted = await formatEditor() ?? editorRef.current?.getValue() ?? '';
      await firestoreService.saveReport(selectedName, formatted);
      savedRef.current = formatted;
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

      <div className="flex-1 min-h-0 flex flex-col">
        {selectedName ? (
          loading ? (
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
          )
        ) : (
          <div className="flex items-center justify-center flex-1 text-xs text-gray-400 px-4 text-center">
            Select a config to edit
          </div>
        )}
      </div>
    </div>
  );
}
