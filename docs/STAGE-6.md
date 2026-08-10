# Stage 6 — Telegram Rooms & Group Voting

Stage 6 turns a solo recommendation into a shared decision.

## Flow

```text
recommendations → create room → invite link → friends join → independent votes → live group leader / consensus
```

## Implemented

- unique `/room/[id]` URLs;
- room creation from the ranked recommendation set;
- up to 8 candidate places;
- PostgreSQL persistence via Prisma;
- 24-hour room lifetime;
- members, options and votes as normalized relational records;
- idempotent yes/no vote upsert per member/place;
- stable anonymous device identity outside Telegram;
- signed Telegram WebApp `initData` verification when `TELEGRAM_BOT_TOKEN` is configured;
- Telegram user ID/name/username stored only after signature validation;
- deterministic tally and leader;
- full-consensus state when every joined member votes yes for the same option;
- Telegram invite sharing;
- polling synchronization every ~2.2 seconds with connection state;
- storage failures return explicit 503 instead of silently losing votes;
- legacy static demo `/room` flow removed.

## Persistence

Rooms use the same PostgreSQL infrastructure as the place catalog. Stage 6 adds:

- `Room`
- `RoomMember`
- `RoomOption`
- `RoomVote`
- `RoomStatus`
- `RoomVoteValue`

Migration: `20260810094000_stage6_rooms`.

A room expires after 24 hours. Expired rooms are treated as unavailable even before physical cleanup, so stale links cannot keep accepting votes indefinitely.

## Telegram identity

Client requests include `Telegram.WebApp.initData` in `x-telegram-init-data`.

Server verification follows Telegram WebApp HMAC validation using `TELEGRAM_BOT_TOKEN`. Only verified payloads are allowed to become `tg_<telegramId>` identities. Browser preview uses a random local member key and never pretends to be a verified Telegram user.

## Acceptance criteria

- recommendations can create a persistent room;
- invite link opens the same room across devices/processes;
- a new participant can join;
- every participant can vote independently;
- changing a vote replaces the previous vote;
- votes update the shared tally;
- leader is deterministic;
- full consensus is visible;
- Telegram identity is cryptographically verified when configured;
- Telegram share sends the canonical room URL;
- storage outages fail explicitly;
- previous recommendation/place flows remain intact;
- Prisma generation, tests, audits, typecheck, lint and production build pass.
