"use client";

/**
 * Doctor · Totals — the swipeable strip of totals, on its own.
 *
 * Visits, POB, support, notes and service, each showing its last three entries
 * and a way into the timeline. Pressing that way in opens the activity panel on
 * that kind of row and scrolls to it — which works even when the trend card is
 * somewhere else entirely on the page, because the two share a session rather
 * than a parent.
 */

import React from "react";

import Banner from "../DoctorDetail/ui/Banner";
import { ALL_CARDS } from "../DoctorDetail/lib/console";
import { CardShell, Unbound, useContainerMode } from "./shell";
import useDoctorConsole from "./useDoctorConsole";

export default function DoctorTotalsCard(props) {
  const { cards, layout = "auto", className, style } = props;

  const c = useDoctorConsole(props);
  const [ref, measured] = useContainerMode(720);

  if (!c) return <Unbound what="The doctor totals strip" innerRef={ref} className={className} style={style} />;

  const compact = layout === "auto" ? measured : layout === "compact";
  const wanted = Array.isArray(cards) && cards.length ? cards : ALL_CARDS;
  // `service` removes itself for a reader who may not see it, whatever the page
  // asked for.
  const order = wanted.filter((k) => ALL_CARDS.includes(k) && (c.canSeeService || k !== "service"));

  return (
    <CardShell innerRef={ref} compact={compact} className={className} style={style}>
      <Banner
        order={order.length ? order : c.bannerOrder}
        cards={c.cards}
        index={c.ui.bannerIdx}
        onIndex={c.on.setBannerIdx}
        compact={compact}
      />
    </CardShell>
  );
}
