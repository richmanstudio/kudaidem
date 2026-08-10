import { places } from "../features/places/data/catalog";
import { recommendFromCatalog } from "../features/recommendations/domain/recommend";
import type { Budget, Mood, SearchFilters } from "../features/recommendations/domain/types";

const moods: Mood[] = ["eat", "fun", "calm", "active", "surprise"];
const budgets: Budget[] = ["low", "mid", "high"];
const parties = [2, 4, 6];
const fixedAt = "2026-08-10T10:00:00.000Z";

let scenarios = 0;
let totalResults = 0;
let strictScenarios = 0;
let relaxedScenarios = 0;
let emptyScenarios = 0;
let diversityPasses = 0;

for (const mood of moods) {
  for (const budget of budgets) {
    for (const party of parties) {
      const filters: SearchFilters = {
        city: "Хабаровск",
        party,
        mood,
        budget,
        at: fixedAt,
      };
      const first = recommendFromCatalog(places, filters);
      const second = recommendFromCatalog(places, filters);
      scenarios += 1;
      totalResults += first.results.length;
      if (first.mode === "strict") strictScenarios += 1;
      else relaxedScenarios += 1;
      if (!first.results.length) emptyScenarios += 1;

      const firstIds = first.results.map((item) => item.id).join(",");
      const secondIds = second.results.map((item) => item.id).join(",");
      if (firstIds !== secondIds) {
        throw new Error(`Non-deterministic ranking for ${mood}/${budget}/${party}`);
      }

      for (const result of first.results) {
        if (!result.isActive || result.city !== filters.city) {
          throw new Error(`Invalid city/active result: ${result.id}`);
        }
        if (party < result.minParty || party > result.maxParty) {
          throw new Error(`Party constraint leaked: ${result.id}`);
        }
        if (result.availability === "closed") {
          throw new Error(`Closed place leaked into recommendations: ${result.id}`);
        }
        if (result.match < 0 || result.match > 98 || result.confidence < 0 || result.confidence > 100) {
          throw new Error(`Invalid score range: ${result.id}`);
        }
        if (!result.reasons.length) {
          throw new Error(`Recommendation has no explanation: ${result.id}`);
        }
      }

      const top = first.results.slice(0, 5);
      if (top.length >= 4) {
        const categories = new Set(top.map((item) => item.category.split(/[·,]/)[0]?.trim().toLowerCase()));
        if (categories.size >= 2) diversityPasses += 1;
        else throw new Error(`Top-5 lacks category diversity for ${mood}/${budget}/${party}`);
      }
    }
  }
}

if (places.length !== 200) {
  throw new Error(`Expected Stage 2 catalog of 200 places, got ${places.length}`);
}
if (emptyScenarios > Math.floor(scenarios * 0.15)) {
  throw new Error(`Too many empty scenarios: ${emptyScenarios}/${scenarios}`);
}

console.log(JSON.stringify({
  engine: "v2",
  catalog: places.length,
  scenarios,
  strictScenarios,
  relaxedScenarios,
  emptyScenarios,
  averageResults: Math.round((totalResults / scenarios) * 10) / 10,
  diversityPasses,
}, null, 2));
