import type { Budget, Mood, SearchFilters } from "./types";

const moods: readonly Mood[] = ["eat", "fun", "calm", "active", "surprise"];
const budgets: readonly Budget[] = ["low", "mid", "high"];

export const DEFAULT_FILTERS: SearchFilters = {
  city: "Хабаровск",
  party: 4,
  mood: "fun",
  budget: "mid",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeParty(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_FILTERS.party;
  return Math.min(8, Math.max(2, Math.round(parsed)));
}

function normalizeMood(value: string | undefined): Mood {
  return moods.includes(value as Mood) ? (value as Mood) : DEFAULT_FILTERS.mood;
}

function normalizeBudget(value: string | undefined): Budget {
  return budgets.includes(value as Budget) ? (value as Budget) : DEFAULT_FILTERS.budget;
}

function normalizeCity(value: string | undefined) {
  return value?.trim() === "Хабаровск" ? "Хабаровск" : DEFAULT_FILTERS.city;
}

function normalizeCoordinate(value: string | undefined, min: number, max: number) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function normalizePositive(value: string | undefined, max: number) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : undefined;
}

function normalizeDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeList(value: string | undefined, max = 30) {
  if (!value) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, max);
  return items.length ? [...new Set(items)] : undefined;
}

function parseValues(get: (key: string) => string | undefined): SearchFilters {
  return {
    city: normalizeCity(get("city")),
    party: normalizeParty(get("party")),
    mood: normalizeMood(get("mood")),
    budget: normalizeBudget(get("budget")),
    latitude: normalizeCoordinate(get("lat"), -90, 90),
    longitude: normalizeCoordinate(get("lon"), -180, 180),
    at: normalizeDate(get("at")),
    maxDistanceKm: normalizePositive(get("maxDistanceKm"), 100),
    excludeIds: normalizeList(get("exclude")),
    seenPlaceIds: normalizeList(get("seen")),
    preferredCategories: normalizeList(get("prefer"), 10),
  };
}

export function parseSearchRecord(
  input: Record<string, string | string[] | undefined>,
): SearchFilters {
  return parseValues((key) => first(input[key]));
}

export function parseSearchParams(input: URLSearchParams): SearchFilters {
  return parseValues((key) => input.get(key) ?? undefined);
}

export function filtersToSearchParams(filters: SearchFilters) {
  const params = new URLSearchParams({
    city: filters.city,
    party: String(filters.party),
    mood: filters.mood,
    budget: filters.budget,
  });
  if (filters.latitude != null) params.set("lat", String(filters.latitude));
  if (filters.longitude != null) params.set("lon", String(filters.longitude));
  if (filters.at) params.set("at", filters.at);
  if (filters.maxDistanceKm != null) params.set("maxDistanceKm", String(filters.maxDistanceKm));
  if (filters.excludeIds?.length) params.set("exclude", filters.excludeIds.join(","));
  if (filters.seenPlaceIds?.length) params.set("seen", filters.seenPlaceIds.join(","));
  if (filters.preferredCategories?.length) params.set("prefer", filters.preferredCategories.join(","));
  return params;
}
