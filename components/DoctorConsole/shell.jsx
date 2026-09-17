"use client";

/**
 * The bit of frame every doctor card shares: its own measured box, and what it
 * says when no doctor has been bound anywhere on the page.
 *
 * Each card measures ITSELF now rather than inheriting one page-wide `compact`.
 * That is strictly better than what the single page component could do — a hero
 * in a wide column and a totals strip in a narrow sidebar each get the layout
 * that fits, instead of both following whichever box the page happened to be in.
 */

import React from "react";

import useContainerMode from "../DoctorDetail/lib/useContainerMode";
import styles from "../DoctorDetail/styles";

export { useContainerMode };

/**
 * One stylesheet, however many cards are on the page.
 *
 * Each card used to sit inside one component that rendered a single `<style>`
 * tag. Five independent cards would each render the same 25KB, so this leans on
 * React 19 hoisting: a `<style>` with an `href` and a `precedence` is deduped by
 * href and lifted into the head, in a server render and in the browser alike.
 * Every card can emit it and the document still gets exactly one.
 */
export function ConsoleStyles() {
  return <style href="elbrit-doctor-console" precedence="default">{styles}</style>;
}

/**
 * Wraps a card in the `dx-root` scope its stylesheet is written against, and
 * tags it compact by the card's own width.
 */
export function CardShell({ innerRef, compact, className = "", style, children }) {
  return (
    <div
      ref={innerRef}
      className={"dx-root dx-root--card" + (compact ? " dx-root--compact" : "") + (className ? " " + className : "")}
      style={style}
    >
      <ConsoleStyles />
      {children}
    </div>
  );
}

/**
 * Shown when nothing on the page has a doctor yet.
 *
 * Not an error: a Studio canvas routinely renders one card on its own while
 * someone is still assembling the page, and four cards each shouting would make
 * that unreadable. It names the one thing that fixes it.
 */
export function Unbound({ what, innerRef, className = "", style }) {
  return (
    <CardShell innerRef={innerRef} className={className} style={style}>
      <div className="dx-empty">
        {what} needs a doctor. Bind one here — a Lead id such as DR-47718, or the row from the
        list — or bind it on any other doctor card on this page and this one follows it.
      </div>
    </CardShell>
  );
}
