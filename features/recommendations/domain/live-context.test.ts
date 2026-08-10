import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWeatherCode,
  daypartAt,
  isInKhabarovskServiceArea,
  KHABAROVSK_CENTER,
} from "@/lib/context/live-context";
import { recommendFromCatalog } from "./recommend";
import type { Place, SearchFilters } from "./types";
import type { LiveContext } from "@/lib/context/types";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "base",
    city: "Хабаровск",
    name: "Тестовое место",
    category: "cafe",
    tags: ["calm"],
    minParty: 2,
    maxParty: 6,
    price: 1200,
    duration: 90,
    closesAt: null,
    openingHoursText: "24/7",
    description: "Тестовая карточка",
    travelMinutes: null,
    accent: "TEST",
    isActive: true,
    address: "Хабаровск",
    latitude: 48.48,
    longitude: 135.07,
    imageUrl: null,
    imageSourceUrl: null,
    imageRights: null,
    sourceUrl: null,
    verifiedAt: "2026-08-10T00:00:00.000Z",
    website: null,
    phone: null,
    rating: 4.6,
    reviewsCount: 400,
    indoor: true,
    outdoor: false,
    alcohol: false,
    food: true,
    activity: false,
    romanticScore: 3,
    activityScore: 1,
    uniquenessScore: 3,
    noiseLevel: 2,
    ...overrides,
  };
}

function context(overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    city: "Хабаровск",
    at: "2026-08-10T10:00:00.000Z",
    daypart: "evening",
    latitude: KHABAROVSK_CENTER.latitude,
    longitude: KHABAROVSK_CENTER.longitude,
    locationSource: "city-center",
    serviceAreaDistanceKm: 0,
    inServiceArea: true,
    degraded: false,
    warnings: [],
    weather: {
      source: "open-meteo",
      kind: "rain",
      temperatureC: 18,
      apparentTemperatureC: 17,
      precipitationMm: 0.8,
      rainMm: 0.8,
      snowfallCm: 0,
      weatherCode: 61,
      isDay: true,
      windSpeedKph: 10,
      observedAt: "2026-08-10T20:00",
    },
    ...overrides,
  };
}

const filters: SearchFilters = {
  city: "Хабаровск",
  party: 4,
  mood: "calm",
  budget: "mid",
  at: "2026-08-10T10:00:00.000Z",
};

test("weather codes are normalized into product-level kinds", () => {
  assert.equal(classifyWeatherCode(0, 20), "clear");
  assert.equal(classifyWeatherCode(63, 10), "rain");
  assert.equal(classifyWeatherCode(75, -5), "snow");
  assert.equal(classifyWeatherCode(96, 18), "storm");
  assert.equal(classifyWeatherCode(0, -30), "extreme");
});

test("Khabarovsk service area protects distance ranking from remote users", () => {
  assert.equal(isInKhabarovskServiceArea(48.48, 135.07), true);
  assert.equal(isInKhabarovskServiceArea(55.75, 37.62), false);
});

test("daypart is calculated in Khabarovsk time", () => {
  assert.equal(daypartAt(new Date("2026-08-10T22:00:00.000Z")), "morning");
  assert.equal(daypartAt(new Date("2026-08-10T12:00:00.000Z")), "evening");
});

test("rain prefers an indoor option over a comparable outdoor option", () => {
  const indoor = place({ id: "indoor", indoor: true, outdoor: false });
  const outdoor = place({ id: "outdoor", indoor: false, outdoor: true });
  const result = recommendFromCatalog([outdoor, indoor], {
    ...filters,
    liveContext: context(),
  });

  assert.equal(result.results[0]?.id, "indoor");
  assert.ok((result.results[0]?.breakdown.context ?? 0) > (result.results[1]?.breakdown.context ?? 0));
});

test("severe weather hard-rejects outdoor-only places", () => {
  const severe = context({
    weather: {
      source: "open-meteo",
      kind: "storm",
      temperatureC: 18,
      apparentTemperatureC: 17,
      precipitationMm: 4,
      rainMm: 4,
      snowfallCm: 0,
      weatherCode: 96,
      isDay: false,
      windSpeedKph: 35,
      observedAt: "2026-08-10T22:00",
    },
  });
  const result = recommendFromCatalog([
    place({ id: "park", indoor: false, outdoor: true }),
    place({ id: "cafe", indoor: true, outdoor: false }),
  ], {
    ...filters,
    liveContext: severe,
  });

  assert.deepEqual(result.results.map((item) => item.id), ["cafe"]);
  assert.equal(result.diagnostics.rejectedContext, 1);
});
