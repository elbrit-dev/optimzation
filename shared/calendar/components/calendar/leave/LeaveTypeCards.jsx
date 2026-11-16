import { Button } from "@calendar/components/ui/button";

const ALLOWED_LEAVE_TYPES = [
  "Casual Leave",
  "Sick Leave",
  "Privilege Leave",
  "Leave Without Pay",
];

/* `types` replaces the default list (an employee on probation gets only
   Probationary Leave and Leave Without Pay). `display` overrides a card's
   label and the text after its number: { [leaveType]: { label, sub } }. */
export function LeaveTypeCards({ balance, value, onChange, loading, types = ALLOWED_LEAVE_TYPES, display = {} }) {
    if (loading) {
      return (
        <div className="text-sm text-muted-foreground">
          Loading leave balance…
        </div>
      );
    }

    const entries = types.map((leaveName) => [
      leaveName,
      balance?.[leaveName],
    ]).filter(([, info]) => Boolean(info));

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
          const isLeaveWithoutPay = info.isLeaveWithoutPay === true;
          const disabled =
            !isLeaveWithoutPay &&
            Number(info?.available ?? 0) <= 0;
          const shown = display[leaveName] ?? {};

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
                {isLeaveWithoutPay ? "LOP" : info.available}
                {!isLeaveWithoutPay && (
                  <span className="text-xs font-normal opacity-70">
                    {shown.sub ?? `/${info.allocated}`}
                  </span>
                )}
              </div>

              <div className="text-xs text-center">
                {shown.label ?? leaveName}
              </div>
            </Button>
          );
        })}
      </div>
    );
  }
