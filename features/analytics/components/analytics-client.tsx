"use client";

import { useEffect } from "react";
import { getTelegramInitData } from "@/lib/telegram/client";

const SESSION_KEY = "kudaidem-analytics-session";

function sessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

export async function track(type: string, data: Record<string, unknown> = {}) {
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-init-data": getTelegramInitData() },
      keepalive: true,
      body: JSON.stringify({ type, sessionId: sessionId(), path: location.pathname, ...data }),
    });
  } catch {}
}

export function AnalyticsClient() {
  useEffect(() => { queueMicrotask(() => void track("APP_OPEN")); }, []);
  return null;
}

export function TrackOnMount({ type, placeId, roomId, metadata }: { type: string; placeId?: string; roomId?: string; metadata?: Record<string, unknown> }) {
  useEffect(() => { queueMicrotask(() => void track(type, { placeId, roomId, metadata })); }, [type, placeId, roomId, metadata]);
  return null;
}
