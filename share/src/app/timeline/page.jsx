'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from 'primereact/button';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Toast } from 'primereact/toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import EventTimeline from './components/EventTimeline';
import { evaluateTimelineSource } from './utils/evaluateTimelineSource';
import { DEFAULT_SAMPLE_EVENTS, DEFAULT_TIMELINE_CONFIG } from './data/defaultSampleEvents';

/** JS (not JSON) so `onEventClick` can be a function. */
const DEFAULT_EDITOR_TEXT = `({
  align: 'alternate',
  onEventClick: (payload) => {
    console.log('[EventTimeline] onEventClick', payload);
  },
  events: ${JSON.stringify(DEFAULT_SAMPLE_EVENTS, null, 2)}
})
`;

function getInitialPlaygroundState() {
  const r = evaluateTimelineSource(DEFAULT_EDITOR_TEXT.trim());
  if (!r.ok) {
    return {
      events: DEFAULT_SAMPLE_EVENTS,
      align: DEFAULT_TIMELINE_CONFIG.align,
      onEventClickHandler: null,
    };
  }
  return {
    events: r.events,
    align: r.align ?? 'alternate',
    onEventClickHandler: r.onEventClickHandler,
  };
}

function TimelinePlaygroundContent() {
  const [editorText, setEditorText] = useState(DEFAULT_EDITOR_TEXT);
  const [timelineEvents, setTimelineEvents] = useState(DEFAULT_SAMPLE_EVENTS);
  const [timelineAlign, setTimelineAlign] = useState(DEFAULT_TIMELINE_CONFIG.align);
  /** Storing a user function in `useState` is unsafe: `setState(fn)` is treated as an updater. */
  const onEventClickRef = useRef(null);
  const [renderTick, setRenderTick] = useState(0);
  const toastRef = useRef(null);
  const editorRef = useRef(null);

  const invokePlaygroundOnEventClick = useCallback((payload) => {
    // eslint-disable-next-line no-console
    console.log('[TimelinePlayground] invoking editor onEventClick', payload);
    const fn = onEventClickRef.current;
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[TimelinePlayground] onEventClick error', e);
    }
  }, []);

  useLayoutEffect(() => {
    const r = evaluateTimelineSource(DEFAULT_EDITOR_TEXT.trim());
    if (!r.ok) return;
    onEventClickRef.current = r.onEventClickHandler;
    setTimelineEvents(r.events);
    setTimelineAlign(r.align ?? 'alternate');
    setRenderTick((t) => t + 1);
  }, []);

  const run = useCallback(() => {
    const result = evaluateTimelineSource(editorText);
    if (!result.ok) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Invalid events',
        detail: result.error,
        life: 6000,
      });
      return;
    }
    onEventClickRef.current = result.onEventClickHandler;
    setTimelineEvents(result.events);
    setTimelineAlign(result.align ?? 'alternate');
    setRenderTick((t) => t + 1);
    toastRef.current?.show({
      severity: 'success',
      summary: 'Timeline updated',
      detail: `${result.events.length} event(s)${result.align ? ` · ${result.align}` : ''} · onEventClick: ${
        result.onEventClickHandler ? 'function' : 'none'
      }`,
      life: 2500,
    });
  }, [editorText]);

  const reset = useCallback(() => {
    setEditorText(DEFAULT_EDITOR_TEXT);
    const next = getInitialPlaygroundState();
    onEventClickRef.current = next.onEventClickHandler;
    setTimelineEvents(next.events);
    setTimelineAlign(next.align);
    setRenderTick((t) => t + 1);
    toastRef.current?.show({
      severity: 'info',
      summary: 'Reset',
      detail: 'Restored default sample data.',
      life: 2500,
    });
  }, []);

  const onEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.layout();
  }, []);

  const timelineOnClick = onEventClickRef.current != null ? invokePlaygroundOnEventClick : undefined;

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col bg-gray-50">
      <div className="min-h-0 min-w-0 flex-1 p-3 sm:p-4">
        <Splitter className="h-full min-h-0 min-w-0 border border-gray-200 rounded-lg bg-white shadow-sm">
          <SplitterPanel className="flex min-w-0 flex-col" size={70} minSize={20}>
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-gray-200 sm:border-r">
              <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">
                Viewer
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <div className="flex min-h-full w-full flex-col items-center justify-center p-4">
                  <EventTimeline
                    events={timelineEvents}
                    align={timelineAlign}
                    onEventClick={timelineOnClick}
                  />
                </div>
              </div>
            </div>
          </SplitterPanel>
          <SplitterPanel className="flex min-w-0 flex-col" size={30} minSize={15}>
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
                <div className="min-w-0 text-sm font-medium text-gray-700">
                  Editor{' '}
                  <span className="font-normal text-gray-500">
                    (only items with <code className="text-xs text-gray-600">clickable: true</code> fire when{' '}
                    <code className="text-xs text-gray-600">onEventClick</code> is set; missing is off)
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button type="button" label="Run" icon="pi pi-play" size="small" onClick={run} />
                  <Button
                    type="button"
                    label="Reset"
                    icon="pi pi-refresh"
                    size="small"
                    severity="secondary"
                    onClick={reset}
                  />
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <Editor
                  height="100%"
                  language="javascript"
                  value={editorText}
                  onChange={(v) => setEditorText(v ?? '')}
                  onMount={onEditorMount}
                  theme="vs-light"
                  options={{
                    wordWrap: 'on',
                    minimap: { enabled: false },
                    renderLineHighlight: 'gutter',
                    tabSize: 2,
                  }}
                />
              </div>
            </div>
          </SplitterPanel>
        </Splitter>
      </div>

      <Toast ref={toastRef} position="top-right" />
    </div>
  );
}

export default function TimelinePage() {
  return (
    <ProtectedRoute>
      <TimelinePlaygroundContent />
    </ProtectedRoute>
  );
}
