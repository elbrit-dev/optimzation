"use client";

import { useEffect, useState } from "react";
import { fetchGoogleCalendarStatus } from "@calendar/components/calendar/module/event/services/event.service";
import { useAuth } from "@calendar/components/auth/auth-context";
import { Button } from "@calendar/components/ui/button";


export default function GoogleCalendarConnect() {
  const { me, googleClientId, googleRedirectUri, } = useAuth();
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
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: googleRedirectUri,
        response_type: "code",
        scope:
          "https://www.googleapis.com/auth/calendar",
        access_type: "offline",
        prompt: "consent",

        // optional - helps identify ERP user
        state: me?.email || "",
      });

    window.location.href = authUrl;
  };

  if (loading) return null;

  if (connected) {
    return (
      <div className="text-green-600">
        ✓ Google Calendar Connected
      </div>
    );
  }

  return (
    <Button  onClick={handleGoogleConnect}>
      Connect Google Calendar
    </Button>
  );
}