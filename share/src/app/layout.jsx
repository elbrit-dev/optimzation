import { Roboto, Work_Sans } from "next/font/google";
/* Import order is load-bearing, and NOT in the obvious direction.
 *
 * globals.css comes FIRST, before the lara theme. That means lara wins every
 * equal-specificity contest, which is why the override sheet leans on
 * `!important` and on doubled selectors like `.p-button.p-component`.
 *
 * Swapping the order looks like the fix and is not — putting globals.css last
 * also puts Tailwind's preflight last, and its border reset then strips the
 * border off every `.p-inputtext`, which blanks out the table's filter row.
 * Reordering is still the right end state, but it needs visual-regression
 * baselines first; see design-system/README.md "Not done yet".
 */
import "./globals.css";
/* NO PRIMEREACT STYLESHEET IS IMPORTED ANYWHERE IN THIS APP.
 *
 * Every component renders `unstyled` with a design-system PassThrough preset
 * (design-system/primereact/registry.js), so the lara theme had nothing left
 * to select. Two of its rules had to be taken over first:
 *   - `.p-icon { width: 1rem; height: 1rem }` sized every SVG glyph and is
 *     emitted even when unstyled; globals.css owns it now.
 *   - `.p-component { font-size: 1rem }` forced 16px on every PrimeReact root.
 *     Fixed by making the surface type scale work rather than reproducing it —
 *     see the responsive body size in tokens/space.css.
 *
 * `primereact.min.css` went too. It was assumed to be the component base CSS
 * and to be what hid the accessibility-only nodes; it is neither. In
 * PrimeReact 10 it is a DEPRECATED EMPTY FILE — 153 bytes of comment, zero
 * rules. What hides `p-hidden-accessible` and the hidden native <select> is
 * the `sr-only` each preset puts on them.
 */
import "primeicons/primeicons.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { DesignSystemPrimeReact } from "@/design-system/primereact/Provider";
import AppHeader from "@/components/AppHeader";

// The design system's two faces. Roboto is the UI default (tables, labels,
// forms, nav); Work Sans carries section titles and chips. Self-hosted by
// next/font, read by --ds-font-ui / --ds-font-display in
// design-system/tokens/fonts.css.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: "ELBRIT - Component Playground",
  description: "ELBRIT Component Playground",
  icons: {
    icon: [
      { url: '/logo.jpeg', type: 'image/jpeg' },
      { url: '/logo.jpeg', type: 'image/jpeg', sizes: '32x32' },
      { url: '/logo.jpeg', type: 'image/jpeg', sizes: '16x16' },
    ],
    apple: '/logo.jpeg',
    shortcut: '/logo.jpeg',
  },
};



export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`light ${roboto.variable} ${workSans.variable}`}>
      <body
        data-surface="console"
        className="antialiased bg-page"
      >
        {/* The design system's PassThrough registry, applied to every
            PrimeReact component in the tree. See
            design-system/primereact/registry.js and
            docs/PRIMEREACT_SWEEP.md. */}
        <DesignSystemPrimeReact>
          <AuthProvider>
            <AppHeader />
            {children}
          </AuthProvider>
        </DesignSystemPrimeReact>
      </body>
    </html>
  );
}

