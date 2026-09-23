"use client";

import { Clock, Filter } from "lucide-react";
import { Button } from "@calendar/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@calendar/components/ui/dropdown-menu";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import {
  VISIT_FILTER,
  VISIT_FILTER_OPTIONS,
  formatVisitTime,
} from "@calendar/lib/calendar/visit-filter";

export function AgendaVisitFilter({ value, onChange, className }) {
  const isActive = value !== VISIT_FILTER.ALL;
  const current =
    VISIT_FILTER_OPTIONS.find((option) => option.value === value) ??
    VISIT_FILTER_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Filter doctor visits"
          className={cn(
            "shrink-0 gap-1.5 px-2",
            isActive && "border-primary text-primary",
            className
          )}
        >
          <Filter />
          {current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {VISIT_FILTER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VisitTime({ event, className }) {
  const { use24HourFormat } = useCalendar();
  const label = formatVisitTime(event, use24HourFormat);

  if (!label) return null;

  return (
    <span
      title="Visit time"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px] leading-none tabular-nums text-muted-foreground",
        className
      )}
    >
      <Clock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
