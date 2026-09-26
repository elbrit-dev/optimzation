'use client';

import { useCallback, useState } from 'react';
import { Button, Card, Icon, Switch } from '@/design-system';
import { RailSection } from '../components/RailSection';

const HOME = { path: '/', label: 'Home', newTab: false };

/* NAVIGATION STAYS IN THE HARNESS. A click on any link inside the screen —
 * a plain anchor or a next/link — is cancelled before it leaves (the
 * listener runs in the capture phase, so the link sees defaultPrevented and
 * does not navigate), and the frame "goes" there instead: an address bar
 * shows the href, a stand-in page stands for the route, Back returns. A
 * target="_blank" link is shown as the new tab it would open.
 *
 *   emulatedBrowser({ enabled: true })
 */
export function emulatedBrowser({ enabled = true } = {}) {
  return {
    id: 'emulatedBrowser',
    use(ctx) {
      const [on, setOn] = ctx.useSetting('emulatedBrowser', enabled);
      const [history, setHistory] = useState([HOME]);
      const current = history[history.length - 1];

      const onClickCapture = useCallback(
        (e) => {
          if (!on) return;
          const a = e.target.closest?.('a[href]');
          if (!a) return;
          const href = a.getAttribute('href');
          if (!href || href.startsWith('#')) return;
          e.preventDefault();
          const entry = { path: href, label: a.getAttribute('aria-label') || a.textContent?.trim() || href, newTab: a.target === '_blank' };
          setHistory((h) => [...h, entry]);
          ctx.log('navigate', [{ href, newTab: entry.newTab, label: entry.label }]);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [on, ctx.log],
      );
      const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

      return {
        panel: (
          <RailSection title="Navigation">
            <Switch checked={Boolean(on)} onChange={setOn} label="Keep link clicks in the harness" />
            <p className="text-11 text-ds-secondary">Links open a stand-in page with an address bar and Back, instead of leaving.</p>
          </RailSection>
        ),
        wrap: (node) =>
          on ? (
            <div className="flex flex-col">
              <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line-subtle bg-surface px-2 py-1.5">
                <Button type="text" size="sm" icon={<Icon name="arrow-left" size="sm" />} onClick={back} disabled={history.length < 2} aria-label="Back" />
                <div data-testid="emulated-address" className="min-w-0 flex-1 truncate rounded-md bg-sunken px-2 py-0.5 text-12 text-ds-secondary">
                  {current.newTab ? `New tab — ${current.path}` : current.path}
                </div>
              </div>
              {/* The screen stays mounted under a stand-in page, so going Back
                  finds it exactly as it was left. */}
              <div onClickCapture={onClickCapture} style={{ display: current === HOME ? undefined : 'none' }}>
                {node}
              </div>
              {current !== HOME ? (
                <div className="p-4">
                  <Card
                    title={current.label}
                    actions={
                      <Button type="default" size="sm" icon={<Icon name="arrow-left" size="sm" />} onClick={back}>
                        Back
                      </Button>
                    }
                  >
                    <p className="text-12 text-ds-secondary">
                      {current.newTab ? `Opened ${current.path} in a new tab.` : `The page at ${current.path} — where this link goes in the app.`}
                    </p>
                  </Card>
                </div>
              ) : null}
            </div>
          ) : (
            node
          ),
      };
    },
  };
}
