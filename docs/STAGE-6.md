# Stage 6 — Telegram Rooms & Group Voting

Stage 6 turns a solo recommendation into a shared decision.

## Flow

```text
recommendations → create room → invite link → friends join → independent votes → live group leader
```

## Implemented

- real room IDs and shareable `/room/[id]` links;
- room creation from the current ranked recommendation set;
- up to 8 candidate places per room;
- stable anonymous member identity stored on-device;
- join and vote API;
- yes/no vote replacement per member and place;
- live tally and deterministic leader ranking;
- Telegram invite sharing;
- polling-based synchronization every 2.5 seconds;
- domain tests for IDs, normalization, tally, winner and invite URLs.

## Runtime persistence

The Stage 6 baseline uses a server-process room store. This is intentionally dependency-free and keeps CI/build deployable without requiring a database during development. It is suitable for functional preview and single-instance runtime.

Before horizontal production scaling, replace the store adapter with PostgreSQL/Redis while preserving the same room domain and API contract. This limitation is explicit: rooms are not claimed to survive process restarts or synchronize across multiple server instances yet.

## Acceptance criteria

- recommendations can create a room;
- invite link opens a room by ID;
- a new device can join;
- every member can vote independently;
- votes update the shared tally;
- leader is deterministic;
- Telegram share sends the canonical room URL;
- previous recommendation/place flows remain intact;
- tests, audits, typecheck, lint and production build pass.
