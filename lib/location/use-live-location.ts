"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearCachedLocation,
  detectLocationPermission,
  openLocationSettings,
  readCachedLocation,
  requestCurrentLocation,
  type ClientLocation,
  type LocationPermissionState,
} from "./client";

export function useLiveLocation() {
  const [location, setLocation] = useState<ClientLocation | null>(null);
  const [permission, setPermission] = useState<LocationPermissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      const cached = readCachedLocation();
      if (!active) return;
      if (cached) {
        setLocation(cached);
        setPermission("granted");
        return;
      }

      try {
        const state = await detectLocationPermission();
        if (active) setPermission(state);
      } catch {
        if (active) setPermission("error");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const request = useCallback(async () => {
    setIsRequesting(true);
    setMessage(null);
    const result = await requestCurrentLocation();
    setIsRequesting(false);
    if (result.ok) {
      setLocation(result.location);
      setPermission("granted");
      return result.location;
    }
    setPermission(result.state);
    setMessage(result.message);
    return null;
  }, []);

  const clear = useCallback(() => {
    clearCachedLocation();
    setLocation(null);
    setMessage(null);
    void detectLocationPermission().then(setPermission).catch(() => setPermission("error"));
  }, []);

  const settings = useCallback(async () => {
    const opened = await openLocationSettings();
    if (!opened) setMessage("Откройте настройки браузера и разрешите доступ к геопозиции для этого сайта.");
    return opened;
  }, []);

  return {
    location,
    permission,
    message,
    isRequesting,
    request,
    clear,
    openSettings: settings,
  };
}
