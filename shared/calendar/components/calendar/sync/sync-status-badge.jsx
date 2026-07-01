"use client";

import { Badge } from "@calendar/components/ui/badge";

function getStatusMeta(event) {
  if (!event?.__syncStatus) return null;

  if (event.__pendingDelete) {
    if (event.__syncStatus === "failed") {
      return {
        label: "Delete Failed",
        className: "bg-red-100 text-red-700 border-red-200",
      };
    }

    return {
      label:
        event.__syncStatus === "syncing"
          ? "Deleting..."
          : "Delete Queued",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    };
  }

  if (event.__syncStatus === "failed") {
    return {
      label: "Sync Failed",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }

  if (event.__syncStatus === "syncing") {
    return {
      label: "Syncing...",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }

  return {
    label: "Queued",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  };
}

export function SyncStatusBadge({ event, className = "" }) {
  const meta = getStatusMeta(event);
  if (!meta) return null;

  return (
    <Badge
      variant="outline"
      className={`${meta.className} ${className}`.trim()}
    >
      {meta.label}
    </Badge>
  );
}

export function SyncErrorMessage({ event, className = "" }) {
  if (!event?.__syncError) return null;

  return (
    <div
      className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`.trim()}
    >
      {event.__syncError}
    </div>
  );
}
