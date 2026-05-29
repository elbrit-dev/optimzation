'use client';

import { useEffect, useRef, useState } from 'react';
import { TabPanel, TabView } from 'primereact/tabview';
import Editor from '@monaco-editor/react';
import { useSmartDataContext } from './SmartDataContext';

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  wordWrap: 'off',
  scrollBeyondLastLine: false,
  lineNumbers: 'on',
  folding: true,
  renderLineHighlight: 'none',
  contextmenu: false,
};

function JsonViewer({ value }) {
  return (
    <Editor
      height="400px"
      language="json"
      value={value}
      options={EDITOR_OPTIONS}
      theme="vs"
    />
  );
}

// Safely serialize pipeline state. Strips `repr` (React elements) and handles other
// non-cloneable values so the debug capture never throws inside buildPipeline.
function serializeState(state) {
  return JSON.parse(JSON.stringify(state, (_key, val) => {
    if (_key === 'repr') return undefined;
    if (typeof val === 'function') return '[Function]';
    if (typeof val === 'symbol') return val.toString();
    return val;
  }));
}

/**
 * Drop inside SmartDataProvider to see each pipeline step's state as read-only JSON.
 * Activated via ?debug=true at page level — this component should only render when debug mode is on.
 */
export function PipelineDebugViewer() {
  const { reportConfig, registerPipelineWatcher, unregisterPipelineWatcher, refresh } = useSmartDataContext();
  const [snapshots, setSnapshots] = useState({});
  const buffers = useRef({});
  const flushTimers = useRef({});

  const viewEntries = Object.entries(reportConfig?.views ?? {});

  useEffect(() => {
    if (viewEntries.length === 0) return;

    for (const [viewId] of viewEntries) {
      buffers.current[viewId] = [];

      registerPipelineWatcher(viewId, (stepName, state) => {
        const buf = buffers.current[viewId];
        // A step we've already seen means a new concurrent run started — discard the stale partial run.
        if (buf.some(s => s.stepName === stepName)) {
          buffers.current[viewId] = [];
        }
        buffers.current[viewId].push({ stepName, state: serializeState(state) });
        // Flush after the pipeline goes quiet (no more steps within one tick).
        clearTimeout(flushTimers.current[viewId]);
        flushTimers.current[viewId] = setTimeout(() => {
          const captured = buffers.current[viewId];
          buffers.current[viewId] = [];
          setSnapshots(prev => ({ ...prev, [viewId]: captured }));
        }, 0);
      });
    }

    // Views already fetched before this effect ran — trigger a fresh run so watchers capture data.
    refresh();

    return () => {
      for (const [viewId] of viewEntries) {
        clearTimeout(flushTimers.current[viewId]);
        unregisterPipelineWatcher(viewId);
      }
    };
  // viewEntries changes identity on every render — stable on reportConfig ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportConfig, registerPipelineWatcher, unregisterPipelineWatcher, refresh]);

  if (viewEntries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <i className="pi pi-code text-cyan-500" />
        Pipeline Debug
      </h2>

      <TabView>
        {viewEntries.map(([viewId, { name }]) => {
          const steps = snapshots[viewId] ?? [];
          return (
            <TabPanel key={viewId} header={name ?? viewId}>
              {steps.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Waiting for first fetch…</p>
              ) : (
                <TabView scrollable>
                  {steps.map(({ stepName, state }) => {
                    const display = state._rawUniGrid ?? state;
                    const rowCount = display.rows?.length ?? 0;
                    return (
                      <TabPanel key={stepName} header={stepName}>
                        <div className="text-xs text-gray-500 mb-1">
                          {rowCount} rows
                          {state.totalRecords != null ? ` / ${state.totalRecords} total` : ''}
                        </div>
                        <JsonViewer value={JSON.stringify(display, null, 2)} />
                      </TabPanel>
                    );
                  })}
                </TabView>
              )}
            </TabPanel>
          );
        })}
      </TabView>
    </div>
  );
}
