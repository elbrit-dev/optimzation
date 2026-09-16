"use client";

/**
 * The seam between the one component that reads ERP and the sections that draw
 * it.
 *
 * `DoctorDetail` still owns every read, the viewer, the scope, the filter and
 * all of the analytics — that has not been split up, on purpose. Nine sections
 * fetching for themselves would be nine chances to scope differently, and the
 * single filter (department, period, value format) only means anything if one
 * thing owns the numbers: the whole point is that no two figures on the page
 * are ever measured over different windows.
 *
 * What IS split is the drawing. `DoctorDetail` publishes everything it computed
 * on this context, and each section reads its own slice, so a Studio page can
 * place them one at a time in a vertical stack instead of taking the whole page
 * as a single block.
 */

import { createContext, useContext } from "react";

export const DoctorConsoleContext = createContext(null);

/**
 * Read the console's state.
 *
 * Returns null when a section has been dropped outside the provider, rather
 * than throwing: a Studio canvas routinely renders a component on its own while
 * someone is still assembling the page, and a thrown error there takes the
 * whole editor view with it. Sections render `<OutsideProvider />` instead.
 */
export function useDoctorConsole() {
  return useContext(DoctorConsoleContext);
}

/** What a section shows when it has no provider above it. */
export function OutsideProvider({ what }) {
  return (
    <div
      role="status"
      style={{
        padding: "14px 16px",
        border: "1px dashed #d7e0f5",
        borderRadius: 12,
        background: "#f8fafc",
        color: "#64748b",
        font: "600 12px/1.5 system-ui, sans-serif",
      }}
    >
      {what} needs a Doctor Data Provider above it — place it inside one.
    </div>
  );
}
