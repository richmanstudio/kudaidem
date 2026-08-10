import assert from "node:assert/strict";
import test from "node:test";
import { availabilityAt, recommendFromCatalog } from "./recommend";
import type { Place, SearchFilters } from "./types";

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
    openingHoursText: null,
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

const filters: SearchFilters = {
  city: "Хабаровск",
  party: 4,
  mood: "calm",
  budget: "mid",
  at: "2026-08-10T10:00:00.000Z",
};

test("opening-hours parser understands Khabarovsk local time", () => {
  const venue = place({ openingHoursText: "Mo-Su 10:00-23:00" });
  assert.equal(availabilityAt(venue, new Date("2026-08-10T10:00:00.000Z")), "open");
  assert.equal(availabilityAt(venue, new Date("2026-08-10T15:00:00.000Z")), "closed");
});

test("hard filters reject a place that cannot host the party", () => {
  const result = recommendFromCatalog([place({ maxParty: 3 })], filters);
  assert.equal(result.results.length, 0);
  assert.equal(result.diagnostics.rejectedParty, 1);
});

test("hard filters reject a confidently closed place", () => {
  const result = recommendFromCatalog(
    [place({ openingHoursText: "Mo-Su 10:00-18:00" })],
    filters,
  );
  assert.equal(result.results.length, 0);
  assert.equal(result.diagnostics.rejectedClosed, 1);
});

test("engine relaxes only the budget when strict candidates are empty", () => {
  const expensive = place({ price: 3200 });
  const result = recommendFromCatalog([expensive], filters);
  assert.equal(result.mode, "relaxed-budget");
  assert.equal(result.results[0]?.id, expensive.id);
  assert.match(result.results[0]?.warnings.join(" ") ?? "", /выше выбранного бюджета/);
});

test("mood match outranks a comparable mismatch", () => {
  const calm = place({ id: "calm", tags: ["calm"], category: "museum" });
  const active = place({ id: "active", tags: ["active"], category: "sport", food: false, activity: true });
  const result = recommendFromCatalog([active, calm], filters);
  assert.equal(result.results[0]?.id, "calm");
  assert.ok((result.results[0]?.breakdown.mood ?? 0) > (result.results[1]?.breakdown.mood ?? 0));
});

test("max distance is a hard constraint when user coordinates are available", () => {
  const near = place({ id: "near", latitude: 48.48, longitude: 135.07 });
  const far = place({ id: "far", latitude: 48.30, longitude: 135.30 });
  const result = recommendFromCatalog([near, far], {
    ...filters,
    latitude: 48.48,
    longitude: 135.07,
    maxDistanceKm: 5,
  });
  assert.deepEqual(result.results.map((item) => item.id), ["near"]);
  assert.equal(result.diagnostics.rejectedDistance, 1);
});

test("excluded places never leak back through fallback", () => {
  const first = place({ id: "first" });
  const second = place({ id: "second" });
  const result = recommendFromCatalog([first, second], {
    ...filters,
    excludeIds: ["first"],
  });
  assert.deepEqual(result.results.map((item) => item.id), ["second"]);
  assert.equal(result.diagnostics.excluded, 1);
});
