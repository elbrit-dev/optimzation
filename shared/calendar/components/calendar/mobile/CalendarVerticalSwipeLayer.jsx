"use client";

import { motion, useMotionValue, animate } from "framer-motion";
import { useRef } from "react";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";

const DRAG_THRESHOLD = 60;

const ORDER = [
  // "year",
  "month-expanded",
  "month-agenda",
  "week",
  "agenda",
];

const LAYER_TO_VIEW = {
  // year: "year",
  "month-expanded": "month",
  "month-agenda": "month",
  week: "week",
  agenda: "agenda",
};

export function CalendarVerticalSwipeLayer({ children, style, enabled = true }) {
  const { mobileLayer, setMobileLayer, setView } = useCalendar();
  const y = useMotionValue(0);
  const lockedAxisRef = useRef(null);

  const handleDirectionLock = (axis) => {
    lockedAxisRef.current = axis;
  };

  const handleDragEnd = (_, info) => {
    const axis = lockedAxisRef.current;
    lockedAxisRef.current = null;

    animate(y, 0, { duration: 0.25, ease: "easeOut" });

    if (!enabled) return;
    if (axis !== "y") return;

    const offsetY = info.offset.y;
    if (Math.abs(offsetY) < DRAG_THRESHOLD) return;

    const currentIndex = ORDER.indexOf(mobileLayer);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (offsetY < 0) {
      nextIndex = Math.min(currentIndex + 1, ORDER.length - 1);
    } else {
      nextIndex = Math.max(currentIndex - 1, 0);
    }

    if (nextIndex === currentIndex) return;

    const nextLayer = ORDER[nextIndex];

    requestAnimationFrame(() => {
      setMobileLayer(nextLayer);
      setView(LAYER_TO_VIEW[nextLayer]);
    });
  };
console.log("MobileLayer",mobileLayer)
  return (
    <motion.div
      drag={enabled ? "y" : false}
      dragDirectionLock
      onDirectionLock={enabled ? handleDirectionLock : undefined}
      style={{ y, ...style }}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      dragMomentum={false}
      onDragEnd={enabled ? handleDragEnd : undefined}
    >
      {children}
    </motion.div>
  );
}
