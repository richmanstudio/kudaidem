# Stage 3 — Recommendation Engine v2

Stage 3 is complete when all of the following remain green:

- hard constraints for city, active status, party size, closed status, explicit exclusions and optional max distance;
- weighted scoring for mood, budget, group, distance, availability, quality, freshness and novelty;
- confidence separated from match score;
- explainable `reasons`, `warnings` and per-signal `breakdown`;
- deterministic category diversification;
- budget-only controlled fallback;
- context parsing for time, coordinates, distance, exclusions, seen places and category preferences;
- `/api/recommendations` v2 diagnostics contract;
- unit tests;
- live 200-place scenario audit;
- TypeScript, ESLint and production Next.js build.

The engine must prefer unknown data over invented precision. Unknown opening hours, price or rating reduce confidence and surface warnings; they are never fabricated.
