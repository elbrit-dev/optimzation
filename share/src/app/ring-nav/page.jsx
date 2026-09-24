'use client';

import { useCallback, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Button, Card, Icon, SegmentedControl } from '@/design-system';
import RingNav from './components/RingNav';
import { DEFAULT_RING_NAV_ITEMS } from './data/defaultRingNavItems';
import { evaluateRingNavSource } from './utils/evaluateRingNavSource';

/* /ring-nav — harness for RingNav, the task strip as a row of shortcuts.
 *
 * The editor holds exactly the props Studio's panel would pass, as JS so
 * `onItemClick` can be a function.
 *
 * NAVIGATION IS EMULATED IN THE VIEWER. A tile press is cancelled before it
 * leaves the harness (the sample hrefs are placeholders, so a real
 * navigation would land on a 404) and the viewer "goes" there instead: the
 * address bar shows the href, the frame shows that route's stand-in page,
 * and Back returns to the strip — the same round trip a rep makes in the
 * app. A `target: '_blank'` item is emulated as the new tab it would open.
 *
 * Static data, no network, no auth — deliberately not in ProtectedRoute, like
 * /visit, so it can be screenshotted.
 */

const DEFAULT_EDITOR_TEXT = `({
  // Each item's href is where its tile goes. A tile with no href is shown
  // but not pressable. target: '_blank' opens it in a new tab.
  stickyBar: true,
  ariaLabel: 'Daily tasks',
  onItemClick: (id, href) => {
    console.log('[RingNav] onItemClick', id, href);
  },
  items: ${JSON.stringify(DEFAULT_RING_NAV_ITEMS, null, 2)}
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
  const r = evaluateRingNavSource(DEFAULT_EDITOR_TEXT);
  return r.ok ? r : { ok: true, props: { items: DEFAULT_RING_NAV_ITEMS }, onItemClick: null };
}

/* The page the strip lives on, in the emulated browser. */
const HOME = { path: '/', label: 'Home', newTab: false };

/* A stand-in for the route a tile links to. In the app this is whatever
   page lives at the href; here it only has to prove the tile went there. */
function EmulatedPage({ entry, onBack }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Card
        title={entry.label}
        actions={
          <Button type="default" size="sm" icon={<Icon name="arrow-left" size="sm" />} onClick={onBack}>
            Back
          </Button>
        }
      >
        <p className="type-app-body text-ds-secondary">
          {entry.newTab
            ? `Opened ${entry.path} in a new tab (target="_blank"). The strip's own page stays where it was.`
            : `The page at ${entry.path}. In the app, this is the route the ${entry.label} tile links to.`}
        </p>
      </Card>
    </div>
  );
}

export default function RingNavPlayground() {
  /* The editor is UNCONTROLLED. Feeding its text back through React state as
     `value` races the typist: a keystroke that lands before the re-render
     makes the editor receive a stale copy, replace its whole model with it,
     and drop the cursor at the end. Monaco owns the text; Run reads it. */
  const editorRef = useRef(null);
  const [run, setRun] = useState(initialRun);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState('390');
  const [log, setLog] = useState([]);
  /* The emulated browser's history. The last entry is the page on screen. */
  const [history, setHistory] = useState([HOME]);
  /* A function in useState is treated as an updater — keep it in a ref. */
  const onItemClickRef = useRef(run.onItemClick);

  const apply = useCallback((result) => {
    onItemClickRef.current = result.onItemClick;
    setRun(result);
    setLog([]);
    setHistory([HOME]);
  }, []);

  const runEditor = useCallback(() => {
    const result = evaluateRingNavSource(editorRef.current?.getValue() ?? '');
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

  const handleItemClick = useCallback(
    (id, href, event) => {
      // Never leave the harness: the viewer emulates the navigation instead.
      event?.preventDefault();
      const item = run.props.items?.find?.((i) => i && typeof i === 'object' && String(i.id) === id);
      setHistory((h) => [
        ...h,
        { path: href, label: item?.label ?? id, newTab: item?.target === '_blank' },
      ]);
      setLog((entries) => [{ id, href }, ...entries].slice(0, 6));
      try {
        onItemClickRef.current?.(id, href);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[RingNav harness] onItemClick threw', e);
      }
    },
    [run.props.items],
  );

  const goBack = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)), []);

  const frameWidth = width === 'fit' ? null : Number(width);
  const current = history[history.length - 1];

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
                  {/* An emulated browser: address bar, then the page. The
                      page is the scroll container, so stickyBar has something
                      to stick to — the same as a real page. */}
                  <div data-surface="app" className="ds-preview-frame flex h-[600px] flex-col overflow-hidden bg-page">
                    <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle bg-surface px-2 py-1.5">
                      <Button
                        type="text"
                        size="sm"
                        icon={<Icon name="arrow-left" size="sm" />}
                        onClick={goBack}
                        disabled={history.length < 2}
                        aria-label="Back"
                      />
                      <div
                        className="min-w-0 flex-1 truncate rounded-md bg-sunken px-2 py-0.5 type-app-body text-ds-secondary"
                        aria-label="Address"
                        data-testid="emulated-address"
                      >
                        {current.newTab ? `New tab — ${current.path}` : current.path}
                      </div>
                    </div>
                    <div className="ds-scrollbar min-h-0 flex-1 overflow-y-auto">
                      {current === HOME ? (
                        <>
                          <RingNav {...run.props} onItemClick={handleItemClick} />
                          <div className="p-4">
                            <Card title="Page content">
                              <p className="type-app-body text-ds-secondary">
                                The rest of the page the strip sits on. Press a tile to go to its page.
                              </p>
                            </Card>
                          </div>
                        </>
                      ) : (
                        <EmulatedPage entry={current} onBack={goBack} />
                      )}
                    </div>
                  </div>
                  <div className="type-app-body text-ds-secondary">
                    Events:{' '}
                    {log.length ? (
                      <code className="text-body">
                        {log.map((e) => `onItemClick("${e.id}", "${e.href}")`).join('  ←  ')}
                      </code>
                    ) : (
                      <span>none yet — press a tile</span>
                    )}
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
                    (the RingNav props, as Studio passes them)
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
