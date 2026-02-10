import { Button } from "@calendar/components/ui/button";

export function LeaveTypeCards({ balance, value, onChange, loading }) {
    if (loading) {
      return (
        <div className="text-sm text-muted-foreground">
          Loading leave balance…
        </div>
      );
    }
  
    const entries = Object.entries(balance ?? {});
  
    if (!entries.length) {
      return (
        <div className="text-sm text-muted-foreground">
          No leave balance available
        </div>
      );
    }
  
    return (
      <div className="grid grid-cols-3 gap-3">
        {entries.map(([leaveName, info]) => {
          const selected = value === leaveName;
          const disabled = info.available <= 0;
  
          return (
            <Button
              key={leaveName}
              type="button"
              disabled={disabled}
              variant={selected ? "default" : "outline"}
              onClick={() => onChange(leaveName)}
              className="h-auto flex flex-col items-center justify-center gap-1 rounded-xl py-4"
            >
              <div className="text-lg font-semibold">
                {info.available}
                <span className="text-xs font-normal opacity-70">
                  /{info.allocated}
                </span>
              </div>
  
              <div className="text-xs text-center">
                {leaveName}
              </div>
            </Button>
          );
        })}
      </div>
    );
  }
  