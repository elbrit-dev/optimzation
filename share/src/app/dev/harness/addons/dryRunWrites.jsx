'use client';

import { useMemo } from 'react';
import { Switch } from '@/design-system';
import { RailSection } from '../components/RailSection';

/* WRITES ARE A DRY RUN until switched on: the screen gets a stand-in writer
 * that reports what it would have sent (browser console) and sends nothing.
 * The switch is remembered per environment and starts off.
 *
 *   dryRunWrites({ makeWriter: (log, ctx) => writer, skipModes: ['mock'] })
 *
 * `makeWriter` builds the stand-in in the shape the screen's `writer` prop
 * expects. READS still go to the ERP (ctx has the environment and token), so
 * a screen that asks the ERP something through its writer — which actions a
 * user may take, whose seat this is — behaves as it will live; only the
 * writes are intercepted. Modes in `skipModes` (the mock) are left alone. */
export function dryRunWrites({ makeWriter, skipModes = ['mock'], label = 'Write to ERP' }) {
  return {
    id: 'dryRunWrites',
    use(ctx) {
      const [write, setWrite] = ctx.useSetting(`write.${ctx.envName}`, false);
      const endpointUrl = ctx.env?.endpointUrl;
      const writer = useMemo(
        () => (endpointUrl ? makeWriter(ctx.log, { endpointUrl, token: ctx.token }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [endpointUrl, ctx.token, ctx.log],
      );
      if (skipModes.includes(ctx.mode)) return null;
      const on = Boolean(write);
      return {
        panel: (
          <RailSection title="Writes">
            <Switch checked={on} onChange={setWrite} label={label} />
            <p className={`text-11 ${on && ctx.env?.production ? 'text-danger-text' : 'text-ds-secondary'}`}>
              {on
                ? ctx.env?.production
                  ? 'LIVE on production — real saves, as the person acting.'
                  : `Saves go to ${ctx.envName} as the person acting.`
                : 'Dry run: reads come from ERP; nothing is written (what would be is in the browser console).'}
            </p>
          </RailSection>
        ),
        props: (p) => (on || !writer ? p : { ...p, writer }),
      };
    },
  };
}
