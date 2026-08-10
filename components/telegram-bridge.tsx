"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        disableVerticalSwipes?: () => void;
        HapticFeedback?: { impactOccurred: (style: "light" | "medium" | "heavy") => void };
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
      };
    };
  }
}

export function TelegramBridge() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#f7f7f5");
    webApp.setBackgroundColor?.("#f7f7f5");
    webApp.disableVerticalSwipes?.();
  }, []);
  return null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function openExternal(url: string) {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openLink) webApp.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
