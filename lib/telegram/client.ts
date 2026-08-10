export type HapticStyle = "light" | "medium" | "heavy";

export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: HapticStyle) => void;
  };
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  viewportStableHeight?: number;
  onEvent?: (event: "viewportChanged", callback: () => void) => void;
  offEvent?: (event: "viewportChanged", callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

export function haptic(style: HapticStyle = "light") {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function openExternal(url: string) {
  if (typeof window === "undefined") return;

  const webApp = getTelegramWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function shareToTelegram(url: string, text: string) {
  if (typeof window === "undefined") return;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const webApp = getTelegramWebApp();

  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(shareUrl);
    return;
  }

  window.open(shareUrl, "_blank", "noopener,noreferrer");
}
