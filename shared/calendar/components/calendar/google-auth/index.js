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

  const handleGoogleConnect = async () => {
    if (!me?.email) {
      console.error("User email not found");
      return;
    }
  
    try {
      const response = await fetch(
        `https://erp.elbrit.org/api/method/frappe.integrations.doctype.google_calendar.google_calendar.authorize_access?g_calendar=${encodeURIComponent(
          me.email
        )}`,
        {
          credentials: "include",
        }
      );
  
      const data = await response.json();
  
      if (data?.message?.url) {
        window.location.href = data.message.url;
      } else {
        console.error("No authorization URL returned", data);
      }
    } catch (error) {
      console.error("Google authorization failed", error);
    }
  };

  if (loading) return null;

  if (connected) {
    return (
     null
    );
  }

  return (
    <Button  onClick={handleGoogleConnect}>
      Connect Google Calendar
    </Button>
  );
}