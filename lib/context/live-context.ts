import type { Daypart, LiveContext, LiveWeather, WeatherKind } from "./types";

export const KHABAROVSK_CENTER = { latitude: 48.4802, longitude: 135.0719 } as const;
export const KHABAROVSK_SERVICE_RADIUS_KM = 70;
const KHABAROVSK_TIME_ZONE = "Asia/Vladivostok";

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function isInKhabarovskServiceArea(latitude: number, longitude: number) {
  return haversineKm(
    latitude,
    longitude,
    KHABAROVSK_CENTER.latitude,
    KHABAROVSK_CENTER.longitude,
  ) <= KHABAROVSK_SERVICE_RADIUS_KM;
}

export function classifyWeatherCode(code: number | null | undefined, temperatureC?: number | null): WeatherKind {
  if (temperatureC != null && (temperatureC <= -28 || temperatureC >= 35)) return "extreme";
  if (code == null || !Number.isFinite(code)) return "unknown";
  if (code === 0) return "clear";
  if ([1, 2, 3, 45, 48].includes(code)) return "cloudy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "unknown";
}

export function daypartAt(date: Date): Daypart {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KHABAROVSK_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number;
  apparent_temperature?: number;
  precipitation?: number;
  rain?: number;
  snowfall?: number;
  weather_code?: number;
  is_day?: number;
  wind_speed_10m?: number;
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
};

function toWeather(payload: OpenMeteoResponse): LiveWeather | null {
  const current = payload.current;
  if (!current) return null;
  const temperatureC = current.temperature_2m ?? null;
  return {
    source: "open-meteo",
    kind: classifyWeatherCode(current.weather_code, temperatureC),
    temperatureC,
    apparentTemperatureC: current.apparent_temperature ?? null,
    precipitationMm: current.precipitation ?? null,
    rainMm: current.rain ?? null,
    snowfallCm: current.snowfall ?? null,
    weatherCode: current.weather_code ?? null,
    isDay: current.is_day == null ? null : current.is_day === 1,
    windSpeedKph: current.wind_speed_10m ?? null,
    observedAt: current.time ?? null,
  };
}

export async function fetchLiveWeather(latitude: number, longitude: number): Promise<LiveWeather | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "is_day",
      "wind_speed_10m",
    ].join(","),
    timezone: KHABAROVSK_TIME_ZONE,
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return null;
    return toWeather(await response.json() as OpenMeteoResponse);
  } catch {
    return null;
  }
}

export async function getLiveContext(input: {
  city?: string;
  latitude?: number;
  longitude?: number;
  at?: string | Date;
} = {}): Promise<LiveContext> {
  const requestedAt = input.at instanceof Date
    ? input.at
    : input.at
      ? new Date(input.at)
      : new Date();
  const at = Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt;
  const hasUserLocation = input.latitude != null && input.longitude != null;
  const latitude = hasUserLocation ? input.latitude! : KHABAROVSK_CENTER.latitude;
  const longitude = hasUserLocation ? input.longitude! : KHABAROVSK_CENTER.longitude;
  const serviceAreaDistanceKm = haversineKm(
    latitude,
    longitude,
    KHABAROVSK_CENTER.latitude,
    KHABAROVSK_CENTER.longitude,
  );
  const inServiceArea = serviceAreaDistanceKm <= KHABAROVSK_SERVICE_RADIUS_KM;
  const warnings: string[] = [];

  if (hasUserLocation && !inServiceArea) {
    warnings.push("Текущая геопозиция находится вне зоны запуска Хабаровска; расстояние до мест не используется.");
  }

  const weatherLatitude = inServiceArea ? latitude : KHABAROVSK_CENTER.latitude;
  const weatherLongitude = inServiceArea ? longitude : KHABAROVSK_CENTER.longitude;
  const weather = await fetchLiveWeather(weatherLatitude, weatherLongitude);
  if (!weather) warnings.push("Погода временно недоступна; рекомендации продолжают работать без этого сигнала.");

  return {
    city: input.city || "Хабаровск",
    at: at.toISOString(),
    daypart: daypartAt(at),
    latitude: round(latitude, 3),
    longitude: round(longitude, 3),
    locationSource: hasUserLocation && inServiceArea ? "user" : "city-center",
    serviceAreaDistanceKm: round(serviceAreaDistanceKm, 1),
    inServiceArea,
    weather,
    degraded: weather == null,
    warnings,
  };
}
