import { Calendar, Clock, Text, User } from "lucide-react";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";

const ICONS = {
  owner: User,
  date: Calendar,
  datetime: Clock,
  text: Text,
};

export function EventDetailsFields({ event, config, use24HourFormat }) {
  if (!config?.details?.fields) return null;
  return (
    <div className="space-y-4">
      {config.details.fields.map((field) => {
        const Icon = ICONS[field.type] ?? Text;
        const value = resolveDisplayValueFromEvent({
          event,
          field,
          use24HourFormat,
        });
        if (!value) return null;
        return (
          <div key={field.key} className="flex items-start gap-2">
            <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-sm text-muted-foreground">{value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
