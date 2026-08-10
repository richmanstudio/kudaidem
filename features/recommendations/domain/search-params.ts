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

export function parseSearchRecord(
  input: Record<string, string | string[] | undefined>,
): SearchFilters {
  return {
    city: normalizeCity(first(input.city)),
    party: normalizeParty(first(input.party)),
    mood: normalizeMood(first(input.mood)),
    budget: normalizeBudget(first(input.budget)),
  };
}

export function parseSearchParams(input: URLSearchParams): SearchFilters {
  return {
    city: normalizeCity(input.get("city") ?? undefined),
    party: normalizeParty(input.get("party") ?? undefined),
    mood: normalizeMood(input.get("mood") ?? undefined),
    budget: normalizeBudget(input.get("budget") ?? undefined),
  };
}

export function filtersToSearchParams(filters: SearchFilters) {
  return new URLSearchParams({
    city: filters.city,
    party: String(filters.party),
    mood: filters.mood,
    budget: filters.budget,
  });
}
