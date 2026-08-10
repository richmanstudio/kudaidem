import { places } from "@/features/places/data/catalog";
import type { Budget, RankedPlace, SearchFilters } from "./types";

const budgetRanges: Record<Budget, [number, number]> = {
  low: [0, 1000],
  mid: [900, 2200],
  high: [1800, 10000],
};

export function rankPlaces(filters: SearchFilters): RankedPlace[] {
  const [minBudget, maxBudget] = budgetRanges[filters.budget];

  return places
    .filter((place) => place.isActive && place.city === filters.city)
    .map((place) => {
      let score = 44;

      if (place.tags.includes(filters.mood)) score += 28;
      if (filters.mood === "surprise") score += place.tags.length * 3;

      if (filters.party >= place.minParty && filters.party <= place.maxParty) score += 16;
      else score -= 20;

      if (place.price != null) {
        if (place.price >= minBudget && place.price <= maxBudget) score += 10;
        else if (Math.abs(place.price - maxBudget) < 500) score += 4;
        else if (place.price > maxBudget * 1.5) score -= 8;
      }

      if (place.travelMinutes != null) {
        score += Math.max(0, 8 - Math.floor(place.travelMinutes / 3));
      }

      if (place.rating != null) score += Math.max(0, Math.min(5, Math.round(place.rating - 4) * 3));
      if (place.imageUrl) score += 2;

      const match = Math.max(62, Math.min(98, score));
      return { ...place, score, match };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.travelMinutes ?? 999) - (b.travelMinutes ?? 999);
    });
}

export function getPlace(id: string) {
  return places.find((place) => place.id === id && place.isActive);
}
