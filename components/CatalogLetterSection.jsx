import React from "react";

/**
 * CatalogLetterSection — the letter holder ("A", "B", "C" …).
 *
 * A dumb wrapper: red letter heading + a slot for whatever cards you place or
 * repeat inside it in Plasmic Studio. It also stamps data-letter="A" on itself,
 * which is the jump target the provider's A–Z rail (Elbrit DataProvider (Views)
 * with showLetterRail) scrolls to and tracks.
 */
export default function CatalogLetterSection({ letter = "A", showLetter = true, children, className }) {
  const resolved = String(letter ?? "").trim().charAt(0).toUpperCase() || "#";
  return (
    <section data-letter={resolved} className={`scroll-mt-4 space-y-3 ${className ?? ""}`}>
      {showLetter ? <h2 className="px-1 text-sm font-bold text-red-600">{resolved}</h2> : null}
      {children}
    </section>
  );
}
