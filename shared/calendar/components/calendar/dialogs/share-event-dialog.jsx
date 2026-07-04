"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@calendar/components/ui/avatar";
import { Button } from "@calendar/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@calendar/components/ui/responsive-modal";
import { RHFCombobox } from "@calendar/components/ui/RHFCombobox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@calendar/components/ui/tooltip";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import {
  fetchDocSharesByDocument,
  syncEventDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";

const SHARED_TO_PASTEL_CLASSES = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-lime-100 text-lime-700",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-cyan-100 text-cyan-700",
  "bg-sky-100 text-sky-700",
  "bg-blue-100 text-blue-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function getInitials(label = "") {
  const cleaned = String(label).trim();
  if (!cleaned) return "?";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function resolveSharedPeople(shares, ownerEmail, employeeOptions, users) {
  const uniqueByEmail = new Map();

  shares
    .map((share) => share?.user?.name)
    .filter(Boolean)
    .filter((email) => email.toLowerCase() !== ownerEmail)
    .forEach((email) => {
      const employee = employeeOptions.find(
        (option) => option.email?.toLowerCase() === email.toLowerCase()
      );
      const user = users.find(
        (candidate) => candidate.email?.toLowerCase() === email.toLowerCase()
      );

      uniqueByEmail.set(email.toLowerCase(), {
        email,
        name: employee?.label ?? user?.name ?? user?.id ?? email,
      });
    });

  return [...uniqueByEmail.values()];
}

function resolveSharedEmployeeIds(shares, employeeOptions) {
  return shares
    .map((share) => share?.user?.name)
    .filter(Boolean)
    .map((email) => {
      const employee = employeeOptions.find(
        (option) => option.email?.toLowerCase() === email.toLowerCase()
      );

      return employee?.value ?? null;
    })
    .filter(Boolean);
}

export function SharedToBlock({
  event,
  className = "",
  variant = "card",
  renderWhenEmpty = false,
}) {
  const { allEmployeeOptions, users } = useCalendar();
  const [sharedTo, setSharedTo] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSharedTo() {
      if (!event?.erpName) {
        setSharedTo([]);
        return;
      }

      try {
        const shares = await fetchDocSharesByDocument("Event", event.erpName);
        if (cancelled) return;

        const ownerEmail = event.ownerEmail?.toLowerCase?.() ?? "";
        const people = resolveSharedPeople(
          shares,
          ownerEmail,
          allEmployeeOptions,
          users
        );

        setSharedTo(people);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch event shares", error);
          setSharedTo([]);
        }
      }
    }

    hydrateSharedTo();

    return () => {
      cancelled = true;
    };
  }, [allEmployeeOptions, event?.erpName, event?.ownerEmail, users]);

  const isFooterVariant = variant === "footer";
  const hasSharedTo = sharedTo.length > 0;

  if (!hasSharedTo && !renderWhenEmpty) return null;

  return (
    <div
      className={cn(
        isFooterVariant
          ? "w-full sm:mr-auto sm:w-auto"
          : "w-full rounded-lg border bg-background/80 px-3 py-2.5",
        className
      )}
      aria-hidden={!hasSharedTo && renderWhenEmpty}
    >
      {hasSharedTo ? (
        <div
          className={cn(
            "flex w-full",
            isFooterVariant
              ? "flex-col gap-1.5"
              : "flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <div className={cn(isFooterVariant ? "min-w-0" : "min-w-[84px]")}>
            <p className="font-bold uppercase tracking-wide text-[10px] text-muted-foreground/80">
              Shared To
            </p>
          </div>

          <TooltipProvider>
            <div
              className={cn(
                "flex flex-wrap items-center gap-2",
                isFooterVariant
                  ? "w-full gap-1.5"
                  : "w-full sm:justify-end"
              )}
            >
              {sharedTo.map((person, index) => (
                <Tooltip key={`${person.email}-${index}`}>
                  <TooltipTrigger asChild>
                    <Avatar className="size-7 cursor-default border border-white/80 shadow-sm">
                      <AvatarFallback
                        className={cn(
                          "text-xs font-semibold",
                          SHARED_TO_PASTEL_CLASSES[
                            index % SHARED_TO_PASTEL_CLASSES.length
                          ]
                        )}
                      >
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] bg-slate-900 text-left text-white">
                    <p className="text-xs font-medium leading-tight">
                      {person.name}
                    </p>
                    {person.email ? (
                      <p className="mt-0.5 text-[11px] text-slate-300">
                        {person.email}
                      </p>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      ) : null}
    </div>
  );
}

export function EventShareDialog({ event, children }) {
  const { allEmployeeOptions, users } = useCalendar();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [sharedToNames, setSharedToNames] = useState([]);

  const ownerEmail = event?.ownerEmail?.toLowerCase?.() ?? "";

  const shareableEmployees = useMemo(() => {
    return allEmployeeOptions.filter(
      (employee) =>
        employee.email &&
        employee.email.toLowerCase() !== ownerEmail
    );
  }, [allEmployeeOptions, ownerEmail]);

  const hydrateShares = useCallback(async () => {
    if (!event?.erpName) {
      setSelectedEmployeeIds([]);
      setSharedToNames([]);
      return;
    }

    const shares = await fetchDocSharesByDocument("Event", event.erpName);
    const nextSelectedIds = resolveSharedEmployeeIds(
      shares,
      shareableEmployees
    );
    const nextNames = resolveSharedPeople(
      shares,
      ownerEmail,
      shareableEmployees,
      users
    ).map((person) => person.name);

    setSelectedEmployeeIds(Array.from(new Set(nextSelectedIds)));
    setSharedToNames(Array.from(new Set(nextNames)));
  }, [event?.erpName, ownerEmail, shareableEmployees, users]);

  useEffect(() => {
    if (!isOpen) return;

    hydrateShares().catch((error) => {
      console.error("Failed to hydrate event shares", error);
      toast.error("Failed to load shared employees");
    });
  }, [hydrateShares, isOpen]);

  const handleSave = async () => {
    if (!event?.erpName) {
      toast.error("Only saved events can be shared");
      return;
    }

    const userIds = selectedEmployeeIds
      .map((employeeId) => {
        const employee = shareableEmployees.find(
          (option) => option.value === employeeId
        );
        return employee?.email ?? null;
      })
      .filter(Boolean);

    if (!userIds.length) {
      toast.error("Select at least one employee to share");
      return;
    }

    setIsSaving(true);

    try {
      await syncEventDocShares(event.erpName, userIds);
      await hydrateShares();
      toast.success("Event shared successfully");
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to share event", error);
      toast.error("Failed to share event");
    } finally {
      setIsSaving(false);
    }
  };

  if (!event?.erpName || String(event.erpName).startsWith("local-")) {
    return null;
  }

  return (
    <Modal open={isOpen} onOpenChange={setIsOpen}>
      <ModalTrigger asChild>
        {children ?? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Share event"
          >
            <Share2 className="size-4" />
          </Button>
        )}
      </ModalTrigger>

      <ModalContent className="sm:max-w-[420px]">
        <ModalHeader>
          <ModalTitle>Share Event</ModalTitle>
        </ModalHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Share with</p>
            <RHFCombobox
              value={selectedEmployeeIds}
              onChange={setSelectedEmployeeIds}
              options={shareableEmployees}
              multiple
              placeholder="Select employees"
              searchPlaceholder="Search employee"
              selectionLabel="employee"
            />
          </div>

          {sharedToNames.length > 0 ? (
            <div>
              <p className="text-sm font-medium">Currently shared to</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sharedToNames.join(", ")}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Sharing..." : "Share"}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
