export type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "storm" | "extreme" | "unknown";
export type Daypart = "morning" | "day" | "evening" | "night";
export type LocationSource = "user" | "city-center";

export type LiveWeather = {
  source: "open-meteo";
  kind: WeatherKind;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  snowfallCm: number | null;
  weatherCode: number | null;
  isDay: boolean | null;
  windSpeedKph: number | null;
  observedAt: string | null;
};

export type LiveContext = {
  city: string;
  at: string;
  daypart: Daypart;
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  serviceAreaDistanceKm: number;
  inServiceArea: boolean;
  weather: LiveWeather | null;
  degraded: boolean;
  warnings: string[];
};
