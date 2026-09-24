'use client';

/* Mounts the design system's PassThrough registry for the whole app.
 *
 * A client boundary because PrimeReactProvider uses context and `app/layout.jsx`
 * is a server component (it exports `metadata`). Keeping the boundary here
 * rather than marking the layout `'use client'` leaves the layout, and
 * everything else it renders, on the server.
 *
 * What this buys: styling for a migrated component is declared once in
 * registry.js instead of being passed at every render site. Roughly 250 render
 * sites across ~30 components would otherwise each need a `pt` prop.
 *
 * It does NOT set `unstyled` — see registry.js for why that is the last step of
 * the sweep rather than the first. Track progress in
 * docs/PRIMEREACT_SWEEP.md.
 */

import { PrimeReactProvider } from 'primereact/api';
import { dsPrimeReactValue } from './registry';

export function DesignSystemPrimeReact({ children }) {
  return <PrimeReactProvider value={dsPrimeReactValue}>{children}</PrimeReactProvider>;
}

export default DesignSystemPrimeReact;
