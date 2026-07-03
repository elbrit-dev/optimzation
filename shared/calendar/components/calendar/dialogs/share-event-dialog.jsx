"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@calendar/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@calendar/components/ui/responsive-modal";
import { RHFCombobox } from "@calendar/components/ui/RHFCombobox";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  fetchDocSharesByDocument,
  syncEventDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";

function resolveSharedNames(shares, ownerEmail, employeeOptions, users) {
  return shares
    .map((share) => share?.user?.name)
    .filter(Boolean)
    .filter((email) => email.toLowerCase() !== ownerEmail)
    .map((email) => {
      const employee = employeeOptions.find(
        (option) => option.email?.toLowerCase() === email.toLowerCase()
      );
      const user = users.find(
        (candidate) => candidate.email?.toLowerCase() === email.toLowerCase()
      );

      return employee?.label ?? user?.name ?? user?.id ?? email;
    });
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

export function SharedToBlock({ event, className = "" }) {
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
        const names = resolveSharedNames(
          shares,
          ownerEmail,
          allEmployeeOptions,
          users
        );

        setSharedTo(Array.from(new Set(names)));
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

  if (!sharedTo.length) return null;

  return (
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
        Shared To
      </p>
      <p className="mt-0.5 text-[13px] leading-snug text-foreground">
        {sharedTo.join(", ")}
      </p>
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
    const nextNames = resolveSharedNames(
      shares,
      ownerEmail,
      shareableEmployees,
      users
    );

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
