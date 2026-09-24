'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Button, Card, Field, Metric, SegmentedControl } from '@/design-system';
import RingTabs from './components/RingTabs';
import RingTabPanel from './components/RingTabPanel';
import { useRingTabs } from './components/RingTabsContext';
import { DEFAULT_RING_TABS } from './data/defaultRingTabs';
import { evaluateRingTabsSource } from './utils/evaluateRingTabsSource';
import { normalizeRingTabs } from './utils/normalizeRingTabs';

/* /ring-tabs — harness for RingTabs, the task strip with a page per tab.
 *
 * The editor holds exactly the props Studio's panel would pass, as JS so
 * `onChange` can be a function. Run re-mounts the strip, so a changed
 * `defaultValue` is actually seen (it only seeds the initial selection).
 *
 * Two modes worth testing, both from the editor:
 *   - UNCONTROLLED (no `value`): the strip owns its selection.
 *   - CONTROLLED (`value: 'leave'`): the harness plays Plasmic's writable
 *     state — it holds the value and feeds onChange back into it, which is
 *     what Studio does with the `value` state. Delete the feedback and the
 *     tabs stop switching, which is the correct behaviour to see.
 *
 * Each tab's page is a demo, with a Notes field: type in one, switch away
 * and back, and the text survives only while keepInactiveMounted is true.
 *
 * Static data, no network, no auth — deliberately not in ProtectedRoute, like
 * /visit, so it can be screenshotted.
 */

const DEFAULT_EDITOR_TEXT = `({
  // Omit \`value\` and the strip owns its selection, starting here.
  // Add value: 'leave' to drive it from outside (Plasmic's writable state).
  defaultValue: 'secondary-entry',
  keepInactiveMounted: true,
  stickyBar: true,
  ariaLabel: 'Daily tasks',
  onChange: (tabId) => {
    console.log('[RingTabs] onChange', tabId);
  },
  tabs: ${JSON.stringify(DEFAULT_RING_TABS, null, 2)}
})
`;

const WIDTHS = [
  { id: 'fit', label: 'Fit' },
  { id: '320', label: '320' },
  { id: '390', label: '390' },
  { id: '430', label: '430' },
  { id: '768', label: '768' },
];

function initialRun() {
  const r = evaluateRingTabsSource(DEFAULT_EDITOR_TEXT);
  return r.ok ? r : { ok: true, props: { tabs: DEFAULT_RING_TABS }, onChange: null };
}

/* A stand-in page. Uses the context directly, the way a Studio page binds
   $ctx.ringTabs, to show a page can open another tab. */
function DemoTabPage({ tab }) {
  const ctx = useRingTabs();
  const [notes, setNotes] = useState('');
  const index = ctx?.tabs.findIndex((t) => t.id === tab.id) ?? -1;
  const next = index >= 0 ? ctx.tabs[(index + 1) % ctx.tabs.length] : null;
  const done = tab.segments?.find((s) => s.key === 'done')?.value;
  const total = tab.segments?.reduce((sum, s) => sum + (Number(s.value) || 0), 0);

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card title={tab.label}>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Pending" value={String(tab.count ?? 0)} caption={tab.caption ? `due ${tab.caption}` : 'nothing due'} />
          <Metric
            label="Done"
            value={done != null && total ? `${Math.round((done / total) * 100)}%` : '—'}
            caption={done != null && total ? 'of this task' : 'no progress set'}
            tone="success"
            progress={done != null && total ? { value: done, max: total } : undefined}
          />
        </div>
      </Card>
      <Card title="Page state">
        <div className="flex flex-col gap-3">
          <Field
            label="Notes"
            placeholder="Type, switch tabs, come back..."
            value={notes}
            onChange={setNotes}
            hint={`tab id: ${tab.id}`}
          />
          {next && next.id !== tab.id ? (
            <Button type="default" size="sm" onClick={() => ctx.setActiveTab(next.id)}>
              Open {next.label} via $ctx.ringTabs.setActiveTab
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

export default function RingTabsPlayground() {
  /* The editor is UNCONTROLLED. Feeding its text back through React state as
     `value` races the typist: a keystroke that lands before the re-render
     makes the editor receive a stale copy, replace its whole model with it,
     and drop the cursor at the end. Monaco owns the text; Run reads it. */
  const editorRef = useRef(null);
  const [run, setRun] = useState(initialRun);
  const [runTick, setRunTick] = useState(0);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState('390');
  const [log, setLog] = useState([]);
  /* The controlled value, when the config asks for one. Seeded on every Run. */
  const [controlled, setControlled] = useState(() => initialRun().props.value ?? null);
  /* A function in useState is treated as an updater — keep it in a ref. */
  const onChangeRef = useRef(run.onChange);

  const apply = useCallback((result) => {
    onChangeRef.current = result.onChange;
    setRun(result);
    setControlled(result.props.value ?? null);
    setRunTick((t) => t + 1);
    setLog([]);
  }, []);

  const runEditor = useCallback(() => {
    const result = evaluateRingTabsSource(editorRef.current?.getValue() ?? '');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    apply(result);
  }, [apply]);

  const reset = useCallback(() => {
    editorRef.current?.setValue(DEFAULT_EDITOR_TEXT);
    setError(null);
    apply(initialRun());
  }, [apply]);

  const isControlled = run.props.value != null;

  const handleChange = useCallback(
    (tabId) => {
      setLog((entries) => [`onChange("${tabId}")`, ...entries].slice(0, 6));
      if (isControlled) setControlled(tabId);
      try {
        onChangeRef.current?.(tabId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[RingTabs harness] onChange threw', e);
      }
    },
    [isControlled],
  );

  const tabs = useMemo(() => normalizeRingTabs(run.props.tabs), [run.props.tabs]);
  const frameWidth = width === 'fit' ? null : Number(width);

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col bg-sunken">
      <div className="min-h-0 min-w-0 flex-1 p-3 sm:p-4">
        <Splitter unstyled className="h-full min-h-0 min-w-0 border border-line-subtle rounded-lg bg-surface shadow-card">
          <SplitterPanel unstyled className="flex min-w-0 flex-col" size={60} minSize={25}>
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-line-subtle sm:border-r">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line-subtle bg-sunken px-3 py-1.5">
                <span className="text-sm font-medium text-body">Viewer</span>
                <SegmentedControl items={WIDTHS} value={width} onChange={setWidth} ariaLabel="Frame width" />
              </div>
              <div className="ds-scrollbar min-h-0 min-w-0 flex-1 overflow-auto p-4">
                <div className="mx-auto flex flex-col gap-3" style={{ width: frameWidth ?? '100%', maxWidth: '100%' }}>
                  {/* The frame is the scroll container, so stickyBar has
                      something to stick to — the same as a real page. */}
                  <div
                    data-surface="app"
                    className="ds-preview-frame ds-scrollbar h-[560px] overflow-y-auto bg-page"
                  >
                    <RingTabs
                      key={runTick}
                      {...run.props}
                      value={isControlled ? controlled : undefined}
                      onChange={handleChange}
                    >
                      {tabs.map((tab) => (
                        <RingTabPanel key={tab.id} tabId={tab.id}>
                          <DemoTabPage tab={tab} />
                        </RingTabPanel>
                      ))}
                    </RingTabs>
                  </div>
                  <div className="type-app-body text-ds-secondary">
                    <div>
                      Mode: <span className="text-body">{isControlled ? `controlled (value="${controlled}")` : 'uncontrolled'}</span>
                      {' · '}
                      {tabs.length} tab(s)
                    </div>
                    <div>
                      Events:{' '}
                      {log.length ? (
                        <code className="text-body">{log.join('  ←  ')}</code>
                      ) : (
                        <span>none yet — press a tile</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SplitterPanel>
          <SplitterPanel unstyled className="flex min-w-0 flex-col" size={40} minSize={20}>
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-subtle bg-sunken px-3 py-1.5">
                <div className="min-w-0 text-sm font-medium text-body">
                  Config{' '}
                  <span className="font-normal text-ds-secondary">
                    (the RingTabs props, as Studio passes them)
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" icon={<i className="pi pi-play" />} onClick={runEditor}>Run</Button>
                  <Button type="default" size="sm" icon={<i className="pi pi-refresh" />} onClick={reset}>Reset</Button>
                </div>
              </div>
              {error ? (
                <div role="alert" className="shrink-0 border-b border-danger-border bg-danger-wash px-3 py-1.5 text-xs text-danger-text">
                  {error}
                </div>
              ) : null}
              <div className="min-h-0 min-w-0 flex-1">
                <Editor
                  height="100%"
                  language="javascript"
                  defaultValue={DEFAULT_EDITOR_TEXT}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
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
    </div>
  );
}
