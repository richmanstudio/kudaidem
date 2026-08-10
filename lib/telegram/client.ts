export type HapticStyle = "light" | "medium" | "heavy";

export type TelegramLocationData = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  course: number | null;
  speed: number | null;
  horizontal_accuracy: number | null;
  vertical_accuracy: number | null;
  course_accuracy: number | null;
  speed_accuracy: number | null;
};

export type TelegramLocationManager = {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init: (callback?: () => void) => TelegramLocationManager;
  getLocation: (callback: (location: TelegramLocationData | null) => void) => TelegramLocationManager;
  openSettings: () => TelegramLocationManager;
};

export type TelegramWebApp = {
  version?: string;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  HapticFeedback?: { impactOccurred: (style: HapticStyle) => void };
  LocationManager?: TelegramLocationManager;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  viewportStableHeight?: number;
  onEvent?: (event: "viewportChanged" | "locationManagerUpdated" | "locationRequested", callback: () => void) => void;
  offEvent?: (event: "viewportChanged" | "locationManagerUpdated" | "locationRequested", callback: () => void) => void;
};

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export function getTelegramWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData ?? "";
}

export function getTelegramUserName() {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user) return null;
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || null;
}

export function haptic(style: HapticStyle = "light") {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function openExternal(url: string) {
  if (typeof window === "undefined") return;
  const webApp = getTelegramWebApp();
  if (webApp?.openLink) { webApp.openLink(url); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function shareToTelegram(url: string, text: string) {
  if (typeof window === "undefined") return;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink) { webApp.openTelegramLink(shareUrl); return; }
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}
