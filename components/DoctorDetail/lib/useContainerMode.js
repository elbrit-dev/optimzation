"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compact by CONTAINER width, not viewport width.
 *
 * The page is a Plasmic code component: it can sit in a narrow column on a wide
 * desktop, and a media query would keep it in the wide layout while it is
 * 380px across. ResizeObserver measures the element itself.
 */
export default function useContainerMode(breakpoint = 720) {
  const ref = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (width) setCompact(width < breakpoint);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);

  return [ref, compact];
}
