# Recommendation Engine v2

`features/recommendations/domain/recommend.ts` is the product decision layer for «Куда идём?». It runs deterministic hard filtering before weighted ranking.

## Hard constraints

1. active venue in selected city;
2. party size fits venue bounds;
3. confidently closed venues are rejected;
4. explicit exclusions are rejected;
5. optional maximum distance is enforced when coordinates exist;
6. strict budget rejects known prices above the configured tolerance.

If strict budget filtering leaves no candidates, only the budget constraint is relaxed. Other hard constraints remain intact.

## Ranking signals

| Signal | Weight |
|---|---:|
| mood | 28 |
| budget | 18 |
| group | 12 |
| distance | 12 |
| availability | 10 |
| quality | 10 |
| freshness | 5 |
| novelty | 5 |

`confidence` measures how much supporting data is actually known. Missing price, opening hours, rating, location or verification data lowers confidence instead of creating fake precision.

## Output

Each ranked place exposes score, user-facing match, confidence, availability, optional distance/travel estimate, reasons, warnings and the complete score breakdown.

## Verification

- Node unit tests cover hard constraints and fallback behavior.
- `npm run recommendation:audit` runs the engine against the live 200-place catalog across 45 baseline scenarios.
- CI blocks merge on tests, live audit, typecheck, ESLint and production build.
