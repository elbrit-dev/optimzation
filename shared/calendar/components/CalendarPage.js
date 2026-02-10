"use client";

import React, { Suspense } from "react";
import { Calendar } from "@calendar/components/calendar/calendar";
import { CalendarSkeleton } from "@calendar/components/calendar/skeletons/calendar-skeleton";
import { AuthProvider } from "@calendar/components/auth/auth-context";

export default function CalendarPage({
  erpUrl,
  authToken,
  me,
  homeUrl,
}) {
  return (
    <AuthProvider
      erpUrl={erpUrl}
      authToken={authToken}
      me={me}
      homeUrl={homeUrl}
    >
      <Suspense fallback={<CalendarSkeleton />}>
        <Calendar />
      </Suspense>
    </AuthProvider>
  );
}
