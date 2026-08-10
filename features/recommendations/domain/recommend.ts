import { places } from "@/features/places/data/catalog";
import { haversineKm } from "@/lib/context/live-context";
import type {
  AvailabilityStatus,
  Budget,
  Place,
  RankedPlace,
  RecommendationDiagnostics,
  RecommendationResult,
  ScoreBreakdown,
  SearchFilters,
} from "./types";

const budgetRanges: Record<Budget, [number, number]> = {
  low: [0, 1000],
  mid: [900, 2200],
  high: [1800, 10000],
};

const WEIGHTS: ScoreBreakdown = {
  mood: 25,
  budget: 18,
  group: 12,
  distance: 12,
  availability: 10,
  context: 8,
  quality: 8,
  freshness: 3,
  novelty: 4,
};

const MOOD_CATEGORY_HINTS: Record<SearchFilters["mood"], RegExp> = {
  eat: /(restaurant|cafe|food|ресторан|кафе|кофе|еда|пицц|бургер|столов)/i,
  fun: /(nightlife|entertain|bar|караоке|боулинг|бильярд|квест|клуб|игр|развлеч)/i,
  calm: /(culture|museum|outdoor|wellness|музей|театр|парк|галере|спа|кофе|прогул)/i,
  active: /(sport|active|боулинг|квест|спорт|каток|фитнес|скал|парк)/i,
  surprise: /.*/,
};

const NIGHTLIFE_HINT = /(nightlife|bar|караоке|бар|клуб|бильярд|боулинг)/i;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function budgetCompatibility(price: number | null, budget: Budget) {
  if (price == null) return { value: 0.56, known: false };
  const [min, max] = budgetRanges[budget];
  if (price >= min && price <= max) return { value: 1, known: true };
  if (price < min) {
    const gap = min - price;
    return { value: clamp(0.9 - gap / Math.max(1200, min) * 0.25, 0.7, 0.92), known: true };
  }
  const over = price - max;
  return { value: clamp(1 - over / Math.max(700, max * 0.65), 0, 0.86), known: true };
}

function moodCompatibility(place: Place, mood: SearchFilters["mood"]) {
  if (mood === "surprise") {
    if (place.tags.includes("surprise")) return 1;
    if (place.uniquenessScore != null) return clamp(place.uniquenessScore / 5);
    return 0.7;
  }
  if (place.tags.includes(mood)) return 1;

  let value = MOOD_CATEGORY_HINTS[mood].test(place.category) ? 0.78 : 0.35;
  if (mood === "eat" && place.food === true) value = Math.max(value, 0.92);
  if (mood === "active" && place.activity === true) value = Math.max(value, 0.94);
  if (mood === "active" && place.activityScore != null) value = Math.max(value, place.activityScore / 5);
  if (mood === "calm" && place.noiseLevel != null) value = Math.max(value, 1 - (place.noiseLevel - 1) / 5);
  return clamp(value);
}

function qualityCompatibility(place: Place) {
  const rating = place.rating == null ? null : clamp((place.rating - 3.4) / 1.6);
  const popularity = place.reviewsCount == null ? null : clamp(Math.log10(place.reviewsCount + 1) / 4);
  if (rating == null && popularity == null) return { value: 0.52, known: false };
  if (rating == null) return { value: 0.45 + (popularity ?? 0) * 0.45, known: true };
  if (popularity == null) return { value: 0.55 + rating * 0.4, known: true };
  return { value: clamp(rating * 0.72 + popularity * 0.28), known: true };
}

function freshnessCompatibility(verifiedAt: string | null, at: Date) {
  if (!verifiedAt) return { value: 0.45, known: false };
  const verified = new Date(verifiedAt);
  if (Number.isNaN(verified.getTime())) return { value: 0.45, known: false };
  const days = Math.max(0, (at.getTime() - verified.getTime()) / 86_400_000);
  if (days <= 14) return { value: 1, known: true };
  if (days <= 60) return { value: 0.88, known: true };
  if (days <= 180) return { value: 0.68, known: true };
  return { value: 0.45, known: true };
}

function distanceCompatibility(place: Place, filters: SearchFilters) {
  if (
    filters.latitude == null || filters.longitude == null
    || place.latitude == null || place.longitude == null
  ) {
    return { value: 0.58, known: false, distanceKm: null, travelMinutes: place.travelMinutes };
  }
  const distanceKm = haversineKm(filters.latitude, filters.longitude, place.latitude, place.longitude);
  const value = clamp(Math.exp(-distanceKm / 5.2));
  const travelMinutes = Math.max(4, Math.round(distanceKm * 3.2 + 3));
  return { value, known: true, distanceKm, travelMinutes };
}

const DAY_CODES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Vladivostok",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value.slice(0, 2) ?? "Mo";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { day: weekday, minutes: hour * 60 + minute };
}

function timeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59) return null;
  return hour === 24 ? 1440 : hour * 60 + minute;
}

function dayMatches(rule: string, current: string) {
  const currentIndex = DAY_CODES.indexOf(current as (typeof DAY_CODES)[number]);
  if (currentIndex < 0) return true;
  const dayExpression = rule.match(/\b(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su))*/g);
  if (!dayExpression) return true;
  for (const expression of dayExpression) {
    const tokens: string[] = expression.match(/Mo|Tu|We|Th|Fr|Sa|Su/g) ?? [];
    if (tokens.length === 1 && tokens[0] === current) return true;
    if (expression.includes("-") && tokens.length >= 2) {
      const start = DAY_CODES.indexOf(tokens[0] as (typeof DAY_CODES)[number]);
      const end = DAY_CODES.indexOf(tokens[1] as (typeof DAY_CODES)[number]);
      if (start <= end && currentIndex >= start && currentIndex <= end) return true;
      if (start > end && (currentIndex >= start || currentIndex <= end)) return true;
    }
    if (!expression.includes("-") && tokens.includes(current)) return true;
  }
  return false;
}

export function availabilityAt(place: Place, at: Date): AvailabilityStatus {
  const raw = place.openingHoursText?.trim();
  if (!raw) return "unknown";
  if (/24\s*\/\s*7/i.test(raw)) return "open";

  const { day, minutes } = localParts(at);
  const rules = raw.split(";").map((rule) => rule.trim()).filter(Boolean);
  let understood = false;

  for (const rule of rules) {
    if (!dayMatches(rule, day)) continue;
    if (/\boff\b|выходн/i.test(rule)) return "closed";
    const ranges = [...rule.matchAll(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g)];
    if (!ranges.length) continue;
    understood = true;
    for (const range of ranges) {
      const start = timeToMinutes(range[1]);
      const end = timeToMinutes(range[2]);
      if (start == null || end == null) continue;
      if (end > start && minutes >= start && minutes < end) return "open";
      if (end <= start && (minutes >= start || minutes < end)) return "open";
    }
  }

  return understood ? "closed" : "unknown";
}

function noveltyCompatibility(place: Place, filters: SearchFilters) {
  if (filters.seenPlaceIds?.includes(place.id)) return 0.18;
  const preferred = filters.preferredCategories?.some((category) =>
    place.category.toLowerCase().includes(category.toLowerCase()),
  );
  if (preferred) return 1;
  if (filters.mood === "surprise" && place.uniquenessScore != null) return clamp(place.uniquenessScore / 5);
  return 0.68;
}

export function contextCompatibility(place: Place, filters: SearchFilters) {
  const context = filters.liveContext;
  if (!context) return { value: 0.68, known: false };

  let value = 0.74;
  const weather = context.weather;
  if (weather) {
    const wet = weather.kind === "rain" || weather.kind === "snow" || weather.kind === "storm"
      || (weather.precipitationMm ?? 0) >= 0.4;
    const harsh = weather.kind === "storm" || weather.kind === "extreme"
      || (weather.precipitationMm ?? 0) >= 2.5
      || (weather.snowfallCm ?? 0) >= 1.5;

    if (wet || harsh) {
      if (place.indoor === true) value = 1;
      if (place.outdoor === true && place.indoor !== true) value = harsh ? 0.05 : 0.2;
    } else if (weather.kind === "clear" || weather.kind === "cloudy") {
      if (place.outdoor === true) value = Math.max(value, 0.9);
      if (place.indoor === true) value = Math.max(value, 0.8);
    }
  }

  if (context.daypart === "night") {
    if (place.outdoor === true && place.indoor !== true) value *= 0.55;
    if (NIGHTLIFE_HINT.test(place.category)) value = Math.max(value, 0.95);
  }
  if (context.daypart === "morning" && NIGHTLIFE_HINT.test(place.category)) value *= 0.55;
  if (context.daypart === "evening" && filters.mood === "fun" && NIGHTLIFE_HINT.test(place.category)) {
    value = Math.max(value, 0.96);
  }

  return { value: clamp(value), known: weather != null };
}

function rejectForLiveContext(place: Place, filters: SearchFilters) {
  const weather = filters.liveContext?.weather;
  if (!weather || place.outdoor !== true || place.indoor === true) return false;
  return weather.kind === "storm"
    || weather.kind === "extreme"
    || (weather.precipitationMm ?? 0) >= 2.5
    || (weather.snowfallCm ?? 0) >= 1.5;
}

function weightedScore(breakdown: ScoreBreakdown) {
  return Object.entries(WEIGHTS).reduce((total, [key, weight]) => {
    return total + breakdown[key as keyof ScoreBreakdown] * weight;
  }, 0);
}

function confidenceScore(input: {
  budgetKnown: boolean;
  distanceKnown: boolean;
  availabilityKnown: boolean;
  contextKnown: boolean;
  qualityKnown: boolean;
  freshnessKnown: boolean;
}) {
  const evidence = [
    [0.25, true],
    [0.18, input.budgetKnown],
    [0.12, true],
    [0.12, input.distanceKnown],
    [0.1, input.availabilityKnown],
    [0.08, input.contextKnown],
    [0.08, input.qualityKnown],
    [0.03, input.freshnessKnown],
    [0.04, true],
  ] as const;
  const known = evidence.reduce((sum, [weight, available]) => sum + (available ? weight : 0), 0);
  return round(clamp(known) * 100);
}

function explanation(place: Place, filters: SearchFilters, breakdown: ScoreBreakdown, distanceKm: number | null) {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (breakdown.mood >= 0.85) reasons.push("точно попадает в выбранное настроение");
  if (breakdown.budget >= 0.9 && place.price != null) reasons.push(`чек около ${place.price.toLocaleString("ru-RU")} ₽ на человека`);
  if (distanceKm != null && distanceKm <= 2.5) reasons.push(`рядом — около ${round(distanceKm, 1)} км`);
  if (breakdown.context >= 0.92 && filters.liveContext?.weather && place.indoor === true
    && ["rain", "snow", "storm", "extreme"].includes(filters.liveContext.weather.kind)) {
    reasons.push("хорошо подходит под текущую погоду");
  }
  if (breakdown.context >= 0.92 && filters.liveContext?.daypart === "night" && NIGHTLIFE_HINT.test(place.category)) {
    reasons.push("уместно для позднего времени");
  }
  if (place.rating != null && place.rating >= 4.5) reasons.push(`высокая оценка ${place.rating.toFixed(1)}`);
  if (filters.mood === "surprise" && (place.uniquenessScore ?? 0) >= 4) reasons.push("необычный вариант для смены сценария");
  if (reasons.length < 2 && place.minParty <= filters.party && filters.party <= place.maxParty) reasons.push(`подходит для компании из ${filters.party}`);
  if (place.price == null) warnings.push("средний чек не подтверждён");
  if (!place.openingHoursText) warnings.push("график работы нужно проверить");
  if (place.rating == null) warnings.push("рейтинг пока не подтверждён");
  return { reasons: reasons.slice(0, 3), warnings };
}

function diversify(ranked: RankedPlace[]) {
  const remaining = [...ranked];
  const result: RankedPlace[] = [];
  const categoryCounts = new Map<string, number>();
  while (remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const place = remaining[index];
      const key = place.category.split(/[·,]/)[0]?.trim().toLowerCase() || place.category.toLowerCase();
      const repeatPenalty = (categoryCounts.get(key) ?? 0) * 5.5;
      const value = place.score - repeatPenalty;
      if (value > bestValue || (value === bestValue && place.id < remaining[bestIndex].id)) {
        bestValue = value;
        bestIndex = index;
      }
    }
    const [picked] = remaining.splice(bestIndex, 1);
    const key = picked.category.split(/[·,]/)[0]?.trim().toLowerCase() || picked.category.toLowerCase();
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    result.push(picked);
  }
  return result;
}

function scorePlace(place: Place, filters: SearchFilters, at: Date): RankedPlace {
  const budget = budgetCompatibility(place.price, filters.budget);
  const distance = distanceCompatibility(place, filters);
  const availability = availabilityAt(place, at);
  const context = contextCompatibility(place, filters);
  const quality = qualityCompatibility(place);
  const freshness = freshnessCompatibility(place.verifiedAt, at);
  const breakdown: ScoreBreakdown = {
    mood: moodCompatibility(place, filters.mood),
    budget: budget.value,
    group: 1,
    distance: distance.value,
    availability: availability === "open" ? 1 : 0.58,
    context: context.value,
    quality: quality.value,
    freshness: freshness.value,
    novelty: noveltyCompatibility(place, filters),
  };
  const score = round(weightedScore(breakdown), 2);
  const confidence = confidenceScore({
    budgetKnown: budget.known,
    distanceKnown: distance.known,
    availabilityKnown: availability !== "unknown",
    contextKnown: context.known,
    qualityKnown: quality.known,
    freshnessKnown: freshness.known,
  });
  const match = Math.round(clamp((score - (1 - confidence / 100) * 10) / 100) * 98);
  const copy = explanation(place, filters, breakdown, distance.distanceKm);
  return {
    ...place,
    score,
    match,
    confidence,
    distanceKm: distance.distanceKm == null ? null : round(distance.distanceKm, 2),
    travelMinutes: distance.travelMinutes,
    availability,
    reasons: copy.reasons,
    warnings: copy.warnings,
    breakdown,
  };
}

export function recommendFromCatalog(catalog: Place[], filters: SearchFilters): RecommendationResult {
  const at = filters.at ? new Date(filters.at) : new Date();
  const safeAt = Number.isNaN(at.getTime()) ? new Date() : at;
  const excluded = new Set(filters.excludeIds ?? []);
  const [, budgetMax] = budgetRanges[filters.budget];
  const diagnostics: RecommendationDiagnostics = {
    totalPlaces: catalog.length,
    cityActive: 0,
    excluded: 0,
    rejectedParty: 0,
    rejectedClosed: 0,
    rejectedBudget: 0,
    rejectedDistance: 0,
    rejectedContext: 0,
    scored: 0,
  };

  const base: Place[] = [];
  const strict: Place[] = [];

  for (const place of catalog) {
    if (!place.isActive || place.city !== filters.city) continue;
    diagnostics.cityActive += 1;
    if (excluded.has(place.id)) {
      diagnostics.excluded += 1;
      continue;
    }
    if (filters.party < place.minParty || filters.party > place.maxParty) {
      diagnostics.rejectedParty += 1;
      continue;
    }
    const availability = availabilityAt(place, safeAt);
    if (availability === "closed") {
      diagnostics.rejectedClosed += 1;
      continue;
    }
    const distance = distanceCompatibility(place, filters);
    if (filters.maxDistanceKm != null && distance.distanceKm != null && distance.distanceKm > filters.maxDistanceKm) {
      diagnostics.rejectedDistance += 1;
      continue;
    }
    if (rejectForLiveContext(place, filters)) {
      diagnostics.rejectedContext += 1;
      continue;
    }
    base.push(place);
    if (place.price != null && place.price > budgetMax * 1.35) {
      diagnostics.rejectedBudget += 1;
      continue;
    }
    strict.push(place);
  }

  const mode = strict.length ? "strict" : "relaxed-budget";
  const candidates = strict.length
    ? strict
    : base.filter((place) => place.price == null || place.price <= budgetMax * 2);

  let results = candidates.map((place) => scorePlace(place, filters, safeAt));
  if (mode === "relaxed-budget") {
    results = results.map((place) => ({
      ...place,
      warnings: place.price != null && place.price > budgetMax
        ? [...place.warnings, "вариант выше выбранного бюджета — показан как запасной"]
        : place.warnings,
    }));
  }

  results.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.id.localeCompare(b.id));
  results = diversify(results);
  diagnostics.scored = results.length;

  return { mode, results, diagnostics };
}

export function recommendPlaces(filters: SearchFilters): RecommendationResult {
  return recommendFromCatalog(places, filters);
}

export function rankPlaces(filters: SearchFilters): RankedPlace[] {
  return recommendPlaces(filters).results;
}

export function getPlace(id: string) {
  return places.find((place) => place.id === id && place.isActive);
}
