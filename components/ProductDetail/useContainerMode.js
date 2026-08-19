import { useEffect, useRef, useState } from "react";

/**
 * useContainerMode — decides whether a component renders its compact
 * (field-app) layout or its wide (web-console) layout.
 *
 * Measures the component's OWN container (ResizeObserver), not the viewport,
 * so the same instance adapts wherever it is dropped — a full-width page, a
 * half-width column, or a 360px phone frame.
 *
 * mode: "auto" (measure) | "desktop" (force wide) | "mobile" (force compact)
 * Returns [ref, compact] — attach `ref` to the outermost wrapper.
 */
export default function useContainerMode(mode = "auto", breakpoint = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    if (mode !== "auto") return;
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    setWidth(el.getBoundingClientRect().width || null);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w != null) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const compact =
    mode === "mobile" || (mode === "auto" && width != null && width < breakpoint);
  return [ref, compact];
}
