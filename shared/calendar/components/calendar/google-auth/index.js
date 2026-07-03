"use client";

import { useEffect, useState } from "react";
import { fetchGoogleCalendarStatus } from "@calendar/components/calendar/module/event/services/event.service";
import { useAuth } from "@calendar/components/auth/auth-context";
import { Button } from "@calendar/components/ui/button";


export default function GoogleCalendarConnect({ className }) {
  const { me, googleClientId, erpUrl, authToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    async function checkCalendar() {
      if (!me?.email) return;

      const calendar = await fetchGoogleCalendarStatus(
        me.email
      );

      const isConnected =
        calendar?.enable === 1 &&
        !!calendar?.refresh_token &&
        !!calendar?.google_calendar_id;

      setConnected(isConnected);
      setLoading(false);
    }

    checkCalendar();
  }, [me]);

  const handleGoogleConnect = () => {
    if (!me?.email) {
      console.error("User email not found");
      return;
    }

    localStorage.setItem(
      "google_calendar_email",
      me.email
    );

    const redirectUri =
      `${window.location.origin}/google-callback`;
    const state = encodeURIComponent(
      JSON.stringify({
        email: me.email,
        erpUrl,
        authToken,
      })
    );
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope:
        "https://www.googleapis.com/auth/calendar",
      state,
    });

    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };
  if (loading) return null;

  if (connected) {
    return (
      null
    );
  }

  return (
    <Button onClick={handleGoogleConnect} className={className}>
      Connect Google Calendar
    </Button>
  );
}
