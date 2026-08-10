"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "./client";

export function TelegramBridge() {
  useEffect(() => {
    const root = document.documentElement;
    const webApp = getTelegramWebApp();

    if (!webApp) {
      root.dataset.runtime = "browser";
      return;
    }

    root.dataset.runtime = "telegram";

    const syncViewport = () => {
      if (webApp.viewportStableHeight) {
        root.style.setProperty("--app-viewport-height", `${webApp.viewportStableHeight}px`);
      }
    };

    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#f7f7f5");
    webApp.setBackgroundColor?.("#f7f7f5");
    webApp.disableVerticalSwipes?.();
    syncViewport();
    webApp.onEvent?.("viewportChanged", syncViewport);

    return () => {
      webApp.offEvent?.("viewportChanged", syncViewport);
      root.style.removeProperty("--app-viewport-height");
    };
  }, []);

  return null;
}
