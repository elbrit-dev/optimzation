// components/ui/TimePicker.jsx
import { format, setHours, setMinutes } from "date-fns";
import { useState } from "react";
import { Button } from "@calendar/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { cn } from "@calendar/lib/utils";

export function TimePicker({
  value,
  onChange,
  interval = 15,
  use24Hour = false,minTime
}) {
  const [open, setOpen] = useState(false);

  const times = [];

  if (use24Hour) {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += interval) {
        times.push({
          h,
          m,
          label: `${h.toString().padStart(2, "0")}:${m
            .toString()
            .padStart(2, "0")}`,
        });
      }
    }
  } else {
    ["am", "pm"].forEach((ampm) => {
      for (let h = 1; h <= 12; h++) {
        for (let m = 0; m < 60; m += interval) {
          let hour24 = h % 12;
          if (ampm === "pm") hour24 += 12;

          times.push({
            h: hour24,
            m,
            label: `${h}:${m.toString().padStart(2, "0")} ${ampm}`,
          });
        }
      }
    });
  }

  function handleSelect(h, m) {
    const base = value ? new Date(value) : new Date();
    const updated = setMinutes(setHours(base, h), m);
    onChange(updated);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between tabular-nums"
        >
          {value
            ? format(value, use24Hour ? "HH:mm" : "hh:mm a").toLowerCase()
            : "Select time"}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-44 p-0" align="start">
        <ScrollArea className="h-64 overscroll-contain">
          <div className="flex flex-col">
            {times.map(({ h, m, label }) => {
              const isSelected =
                value &&
                value.getHours() === h &&
                value.getMinutes() === m;
                const isDisabled =
                minTime &&
                (h < minTime.getHours() ||
                  (h === minTime.getHours() && m <= minTime.getMinutes()));
              
              return (
                <button
                key={`${h}-${m}`}
                disabled={isDisabled}
                onClick={() => handleSelect(h, m)}
                className={cn(
                  "px-3 py-2 text-left text-sm tabular-nums",
                  isDisabled
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-muted",
                  isSelected && "bg-muted font-medium"
                )}
              >
                {label}
              </button>
              
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
