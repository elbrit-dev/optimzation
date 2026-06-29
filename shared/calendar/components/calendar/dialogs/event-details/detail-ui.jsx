"use client";
import { getStatusBadgeClass } from "@calendar/components/calendar/helpers";

/**
 * Shared, compact presentational pieces for the event-details dialogs.
 * Tuned small for a phone in the field: tight type, hairline-separated rows,
 * thumb-friendly actions. A rep grasps "what + when + status" instantly;
 * a manager can still read every fact.
 */

export function StatusPill({ status, className = "" }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${getStatusBadgeClass(
        status
      )} ${className}`}
    >
      {status}
    </span>
  );
}

/** Top strip: accent bar + title + date/time + status. The one-glance summary. */
export function DetailSummary({ title, subtitle, status, accentClassName = "bg-primary" }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
      <span className={`mt-0.5 w-1 shrink-0 self-stretch rounded-full ${accentClassName}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug text-foreground break-words">
            {title}
          </p>
          {status ? <StatusPill status={status} className="mt-0.5 shrink-0" /> : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground break-words">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A single labelled fact row. Renders nothing when empty. */
export function DetailItem({ icon: Icon, label, children, className = "" }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className={`flex items-start gap-2.5 py-2.5 ${className}`}>
      {Icon ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
          {label}
        </p>
        <div className="mt-0.5 break-words text-[13px] leading-snug text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Compact single-column list with hairline dividers between rows (Format A). */
export function DetailGrid({ children, className = "" }) {
  return (
    <div className={`flex flex-col divide-y divide-border ${className}`}>{children}</div>
  );
}

export function PersonChips({ people = [] }) {
  if (!people.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((person, index) => {
        const name = person?.name ?? person?.label ?? person?.id ?? "—";
        return (
          <span
            key={person?.id ?? index}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-[11.5px] font-medium text-foreground"
          >
            <span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              {String(name).trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="max-w-[10rem] truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Action footer: stacks full-width on mobile, right-aligned row on desktop. */
export function DetailFooter({ children, className = "" }) {
  return (
    <div
      className={`mt-1 flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end ${className}`}
    >
      {children}
    </div>
  );
}
