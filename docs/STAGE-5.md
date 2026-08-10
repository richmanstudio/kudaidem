# Stage 5 — Production Place Experience

Stage 5 closes the user flow between a recommendation and a real-world visit.

## Goal

A user who accepts a recommendation must be able to understand the venue, trust the data and take the next action without leaving the product confused.

```text
recommendation
    ↓
production place page
    ↓
route / call / website / share / evening plan
    ↓
real visit
```

## Place decision surface

The place page now uses the same live context and recommendation filters that produced the result. When the venue is still in the ranked set, the page displays:

- match percentage;
- recommendation confidence;
- distance and approximate travel time;
- price and rating when known;
- 1–3 explainable reasons;
- warnings for incomplete evidence;
- current availability from the Stage 4 context layer.

Unknown facts remain unknown. The UI does not invent a price, schedule, rating or ETA.

## Actions

Primary action: **Build route** in Yandex Maps.

Secondary actions appear only when the corresponding source data exists:

- Call — normalized `tel:` URL;
- Website — only safe HTTP/HTTPS URLs;
- Share — native Web Share first, Telegram share fallback;
- Build evening plan — preserves the recommendation query context.

Every place remains routeable by coordinates or address.

## Trust & provenance

The page exposes:

- data source;
- verification date;
- production media status;
- source link when available;
- photo author/license attribution for approved media.

Review-only and third-party media are not shown in production unless explicitly enabled by environment override. `APPROVED` and `OFFICIAL_SOURCE` media are production-displayable.

## UX decisions

The old decorative pseudo-map was removed. It looked like a map but had no map semantics or live routing value.

The replacement is a compact location card with the actual address and distance. The real map is opened only through the route action.

The visual hierarchy is intentionally small:

1. venue image/fallback;
2. venue name + match/confidence;
3. decision facts;
4. why this venue;
5. availability / price / travel;
6. address;
7. trust/provenance;
8. actions.

## Quality gates

Stage 5 adds two layers of verification.

### Unit tests

`features/places/domain/experience.test.ts` verifies:

- coordinate route URL;
- address fallback route URL;
- phone normalization;
- safe external URL policy;
- production image-rights policy;
- availability/confidence labels;
- share copy.

### Production catalog audit

`npm run place:audit` runs over all 200 production places and requires:

- every place to be routeable;
- every place to have source provenance;
- every place to have a valid verification timestamp.

It also reports non-blocking coverage for:

- phone actions;
- website actions;
- production-approved photos;
- fallback visuals.

## Acceptance criteria

Stage 5 is complete when:

- a result opens a production place page with preserved recommendation context;
- current availability and recommendation reasoning are shown when available;
- route works for every catalog place;
- phone/site CTAs are conditional and safe;
- share has native + Telegram fallback;
- production image policy is enforced;
- decorative pseudo-map is removed;
- the 200-place audit passes;
- unit tests, recommendation audit, TypeScript, ESLint and Next.js production build pass.
