import { getTelegramWebApp } from "@/lib/telegram/client";

export type LocationProvider = "telegram" | "browser";
export type LocationPermissionState = "idle" | "prompt" | "granted" | "denied" | "unavailable" | "error";

export type ClientLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  provider: LocationProvider;
  capturedAt: string;
};

export type LocationResult =
  | { ok: true; location: ClientLocation }
  | { ok: false; state: Exclude<LocationPermissionState, "idle" | "granted">; message: string };

const SESSION_KEY = "kudaidem:location:v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

function privacyCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeLocation(input: {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  provider: LocationProvider;
}): ClientLocation {
  return {
    latitude: privacyCoordinate(input.latitude),
    longitude: privacyCoordinate(input.longitude),
    accuracyM: input.accuracyM == null ? null : Math.max(0, Math.round(input.accuracyM)),
    provider: input.provider,
    capturedAt: new Date().toISOString(),
  };
}

export function readCachedLocation(): ClientLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ClientLocation;
    const captured = new Date(value.capturedAt).getTime();
    if (!Number.isFinite(captured) || Date.now() - captured > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return null;
    return value;
  } catch {
    return null;
  }
}

export function cacheLocation(location: ClientLocation) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(location));
  } catch {
    // Session storage is optional. Location still works without persistence.
  }
}

export function clearCachedLocation() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

async function initializeTelegramLocationManager() {
  const webApp = getTelegramWebApp();
  const manager = webApp?.LocationManager;
  if (!manager || webApp?.isVersionAtLeast?.("8.0") === false) return null;
  if (manager.isInited) return manager;
  await new Promise<void>((resolve) => manager.init(resolve));
  return manager;
}

export async function detectLocationPermission(): Promise<LocationPermissionState> {
  if (typeof window === "undefined") return "unavailable";

  const manager = await initializeTelegramLocationManager();
  if (manager) {
    if (!manager.isLocationAvailable) return "unavailable";
    if (manager.isAccessGranted) return "granted";
    if (manager.isAccessRequested) return "denied";
    return "prompt";
  }

  if (!("geolocation" in navigator)) return "unavailable";
  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      return permission.state;
    }
  } catch {
    // Some embedded browsers expose Permissions API incompletely.
  }
  return "prompt";
}

async function requestTelegramLocation(): Promise<LocationResult | null> {
  const manager = await initializeTelegramLocationManager();
  if (!manager) return null;
  if (!manager.isLocationAvailable) {
    return { ok: false, state: "unavailable", message: "Геолокация недоступна на этом устройстве." };
  }

  return await new Promise<LocationResult>((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({ ok: false, state: "error", message: "Не удалось быстро определить геопозицию." });
    }, 10_000);

    manager.getLocation((data) => {
      window.clearTimeout(timeout);
      if (!data) {
        resolve({
          ok: false,
          state: manager.isAccessRequested && !manager.isAccessGranted ? "denied" : "error",
          message: "Доступ к геопозиции не предоставлен.",
        });
        return;
      }
      const location = normalizeLocation({
        latitude: data.latitude,
        longitude: data.longitude,
        accuracyM: data.horizontal_accuracy,
        provider: "telegram",
      });
      cacheLocation(location);
      resolve({ ok: true, location });
    });
  });
}

async function requestBrowserLocation(): Promise<LocationResult> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return { ok: false, state: "unavailable", message: "Геолокация не поддерживается этим браузером." };
  }

  if (!window.isSecureContext) {
    return { ok: false, state: "unavailable", message: "Для геолокации нужен HTTPS." };
  }

  return await new Promise<LocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = normalizeLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          provider: "browser",
        });
        cacheLocation(location);
        resolve({ ok: true, location });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, state: "denied", message: "Доступ к геопозиции запрещён." });
          return;
        }
        if (error.code === error.TIMEOUT) {
          resolve({ ok: false, state: "error", message: "Определение геопозиции заняло слишком много времени." });
          return;
        }
        resolve({ ok: false, state: "error", message: "Не удалось определить геопозицию." });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 },
    );
  });
}

export async function requestCurrentLocation(): Promise<LocationResult> {
  const telegram = await requestTelegramLocation();
  return telegram ?? requestBrowserLocation();
}

export async function openLocationSettings() {
  const manager = await initializeTelegramLocationManager();
  if (!manager) return false;
  manager.openSettings();
  return true;
}
