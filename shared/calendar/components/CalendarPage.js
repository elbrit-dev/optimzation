"use client";

import React, { Suspense } from "react";
import { Toaster } from "sonner";
import { Calendar } from "@calendar/components/calendar/calendar";
import { CalendarSkeleton } from "@calendar/components/calendar/skeletons/calendar-skeleton";
import { AuthProvider } from "@calendar/components/auth/auth-context";

export default function CalendarPage({
  erpUrl,
  authToken,
  me,
  homeUrl,googleClientId,googleRedirectUri
}) {
  return (
    <AuthProvider
      erpUrl={erpUrl}
      authToken={authToken}
      me={me}
      homeUrl={homeUrl}
      googleClientId={googleClientId}
      googleRedirectUri={googleRedirectUri}
    >
      {/* Mounted here so toasts work wherever the calendar is embedded
          (the host Plasmic app doesn't render Sonner's Toaster). */}
      <Toaster richColors position="top-right" />
      <Suspense fallback={<CalendarSkeleton />}>
        <Calendar />
      </Suspense>
    </AuthProvider>
  );
}
