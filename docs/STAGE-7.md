# Stage 7 — Analytics + Closed Beta

Stage 7 turns the MVP into an observable product that can be tested with real people without opening it publicly.

## Product funnel

```text
APP_OPEN
  → SEARCH_SUBMITTED
  → RECOMMENDATION_SHOWN
  → RECOMMENDATION_ACCEPTED
  → ROUTE_OPENED
```

Social events are tracked separately: `ROOM_CREATED`, `ROOM_JOINED`, `ROOM_VOTED`. Beta feedback and client errors have their own event types.

## Analytics policy

Analytics is first-party and stored in PostgreSQL. A random session ID lives in `sessionStorage`. Verified Telegram identity is never stored raw in analytics: only a short SHA-256-derived actor hash is written. Exact user geolocation is not included in analytics events.

## Closed beta

`BETA_MODE=1` enables the access boundary. Invites are stored as SHA-256 hashes in `BetaInvite`; the plain invite code is shown only once by the issuance CLI.

```bash
npm run beta:issue -- "DVGU cohort" 10 14
```

Arguments are label, max uses and validity in days. Successful redemption sets a signed HttpOnly beta cookie. Invites support active/disabled state, max uses and expiry.

## Operator dashboard

`/ops?token=<OPS_DASHBOARD_TOKEN>` shows a rolling 7-day snapshot:

- unique sessions;
- opens, searches, recommendation impressions, accepts and route opens;
- Open → Search conversion;
- Shown → Accept conversion;
- Accept → Route conversion;
- recent beta feedback.

The dashboard is server-rendered and does not expose the token to analytics.

## Feedback

When beta mode is enabled, testers get a compact feedback entrypoint in the app. Feedback stores optional 1–5 rating, message, path and anonymous analytics session ID.

## Required production environment

```bash
DATABASE_URL=...
TELEGRAM_BOT_TOKEN=...
BETA_MODE=1
BETA_SESSION_SECRET=<long random secret>
OPS_DASHBOARD_TOKEN=<long random token>
```

## Acceptance criteria

- first-party funnel events persist in PostgreSQL;
- analytics does not store raw Telegram identity;
- recommendation acceptance and route conversion are measurable;
- room creation/join/vote are measurable;
- closed beta can be switched on without code changes;
- invite codes have expiry and usage limits;
- beta access uses an HttpOnly signed cookie;
- testers can submit feedback;
- operator dashboard exposes the core launch funnel;
- Stage 1–6 flows remain intact;
- Prisma generation, tests, audits, typecheck, lint and production build pass.
