# Stage 4 — Geolocation & Live Context

Status: **complete when CI is green and merged to `main`**.

## Goal

Make recommendations react to the user's real situation instead of treating every request as if it happened at the same place and time.

Stage 4 adds four contextual inputs:

1. current/requested time in `Asia/Vladivostok`;
2. optional user geolocation;
3. live weather for the relevant point in Khabarovsk;
4. a Khabarovsk launch-area guard so remote coordinates cannot destroy the ranking.

## Location acquisition

Preferred runtime path:

```text
Telegram Mini App
  -> Telegram.WebApp.LocationManager (Bot API 8.0+)
  -> browser Geolocation API fallback
  -> no-location mode if unavailable/denied
```

Location is requested only after explicit user interaction.

Client privacy rules:

- coordinates are rounded to 3 decimal places before they are used by the product (~100 m precision);
- the location cache uses `sessionStorage`, not persistent storage;
- cache TTL is 10 minutes;
- the user can disable location from the home screen;
- denied Telegram access exposes the native location-settings flow;
- exact raw coordinates are not intentionally persisted by the app.

## Service area

Launch center: `48.4802, 135.0719`.

Launch radius: **70 km**.

If the user's current position is outside this radius:

- weather falls back to Khabarovsk center;
- user-distance ranking is disabled;
- max-distance hard filtering is disabled;
- the recommendation flow continues normally;
- UI explains that the current position is outside the launch area.

This prevents an out-of-city user from receiving an empty result set just because the product currently serves only Khabarovsk.

## Live weather

Provider: **Open-Meteo Forecast API**.

Requested current variables:

```text
temperature_2m
apparent_temperature
precipitation
rain
snowfall
weather_code
is_day
wind_speed_10m
```

Product weather kinds:

```text
clear
cloudy
rain
snow
storm
extreme
unknown
```

Provider failure is non-fatal. `LiveContext.degraded=true` is returned and recommendation ranking continues with a neutral context signal.

## Recommendation integration

Stage 4 adds a ninth weighted signal:

| Signal | Weight |
|---|---:|
| Mood | 25% |
| Budget | 18% |
| Group | 12% |
| Distance | 12% |
| Availability | 10% |
| Live context | 8% |
| Quality | 8% |
| Freshness | 3% |
| Novelty | 4% |

Live-context behavior includes:

- rain/snow/storm favor indoor venues;
- clear weather can improve outdoor venues;
- severe weather hard-rejects outdoor-only venues;
- late night penalizes outdoor-only scenarios;
- late night can improve nightlife categories;
- morning penalizes nightlife categories;
- evening + `fun` can improve nightlife categories.

The context score is included in `breakdown.context` and context availability contributes to recommendation confidence.

## API

### `GET /api/context`

```text
/api/context
/api/context?lat=48.48&lon=135.07
/api/context?lat=48.48&lon=135.07&at=2026-08-10T10:00:00.000Z
```

Returns:

```ts
{
  version: "live-v1",
  context: LiveContext
}
```

### `GET /api/recommendations`

Stage 4 keeps Recommendation Engine v2 and adds live-context enrichment. Response contract version becomes `v2.1` and contains `contextVersion: "live-v1"` plus the resolved context.

## UX acceptance criteria

Home:

- one compact location control under the city;
- loading, granted, denied, unavailable and error states;
- explicit way to disable cached location;
- no mandatory permission prompt.

Result:

- current weather + temperature + daypart visible;
- distance/ETA only when real in-area location is usable;
- clear notice when location is outside Khabarovsk launch area;
- existing recommendation reasons remain primary.

## Tests

Stage 4 adds tests for:

- WMO weather-code classification;
- Khabarovsk service-area guard;
- Khabarovsk daypart calculation;
- rain preferring indoor venues;
- severe weather rejecting outdoor-only venues.

All existing Stage 3 tests and the 45-scenario production-catalog audit remain mandatory.

## Definition of done

Stage 4 is done only when all of the following pass:

```text
npm run test
npm run recommendation:audit
npm run typecheck
npm run lint
npm run build
```

and the PR is merged to `main`.
