<div align="center">
  <img src="./docs/readme-hero.svg" width="100%" alt="Куда идём? — Telegram Mini App by DUONIQ" />

  <br />

  **Не каталог мест. Движок принятия решения о том, куда идти прямо сейчас.**

  `v0.5 · Хабаровск · Telegram Mini App · Next.js 16 · TypeScript · PostgreSQL · Prisma`
</div>

---

## Product

**«Куда идём?»** убирает бесконечное «ну и куда пойдём?». Пользователь задаёт размер компании, настроение и бюджет, а приложение учитывает реальную ситуацию вокруг него и возвращает небольшой набор подходящих вариантов вместо сотен карточек каталога.

> **Мы выбираем место, чтобы пользователю не пришлось.**

Текущий launch market — **Хабаровск**. Product baseline — собственный live-каталог из **200 мест**.

## Stage 5 · Production Place Experience

Stage 5 закрывает путь от рекомендации до реального действия.

```text
recommendation
      ↓
production place page
      ↓
route · call · website · share · evening plan
      ↓
real-world visit
```

Карточка места больше не является справочной страницей. Она использует тот же контекст, который сформировал рекомендацию, и показывает пользователю только то, что помогает принять решение:

- match + confidence;
- актуальный availability status;
- расстояние и ETA при наличии геолокации;
- чек и рейтинг только если они подтверждены;
- объяснимые причины рекомендации;
- предупреждения по неполным данным;
- адрес и provenance;
- production media status.

Основной CTA — **построить маршрут**. Дополнительные действия появляются только когда для них есть реальные данные: звонок, официальный сайт, share и план вечера.

Старая декоративная псевдо-карта удалена. В интерфейсе остаётся компактная карточка адреса, а настоящий маршрут открывается в Yandex Maps.

Полная спецификация: [`docs/STAGE-5.md`](./docs/STAGE-5.md).

## Stage 4 · Geolocation & Live Context

Stage 4 делает рекомендации контекстными.

```text
optional user location
        +
current Khabarovsk time
        +
live weather
        +
opening hours
        ↓
Recommendation Engine v2.1
        ↓
short explainable result set
```

В Telegram Mini App используется нативный `Telegram.WebApp.LocationManager`; если он недоступен, приложение переходит на browser Geolocation API.

- permission только после действия пользователя;
- session-only location cache на 10 минут;
- координаты округляются примерно до 100 м;
- геолокацию можно отключить;
- 70-км launch-area guard;
- без геолокации основной flow работает полностью.

Current weather приходит через Open-Meteo и нормализуется в `clear · cloudy · rain · snow · storm · extreme · unknown`. Provider failure не ломает выдачу.

## Recommendation Engine v2.1

Hard constraints применяются до ranking:

- active + выбранный город;
- вместимость компании;
- подтверждённо закрытые места исключаются;
- optional max distance;
- explicit exclusions;
- outdoor-only места исключаются при severe weather.

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

Результат содержит `score`, `match`, `confidence`, availability, distance/ETA, human-readable reasons/warnings и полный breakdown. Если строгая выдача пуста, engine может ослабить только бюджет.

## Live catalog

Stage 2 создал воспроизводимый data layer для Хабаровска.

**Baseline:**

- 200 / 200 мест;
- координаты;
- media candidate + source provenance;
- source URL + `verifiedAt`;
- категории + recommendation tags;
- PostgreSQL / Prisma model;
- automatic refresh, dedupe, sanitizer и audits.

Неподтверждённое поле остаётся `null`; UI не подменяет неизвестность выдуманной точностью.

### Media rights

Production UI показывает фото только если media status — `APPROVED` или `OFFICIAL_SOURCE`. `NEEDS_REVIEW` и `THIRD_PARTY_UNKNOWN` по умолчанию используют фирменный fallback visual. Отладочный override возможен только через environment flag.

## Architecture

```mermaid
flowchart TD
    TG[Telegram Mini App] --> NX[Next.js App Router]
    TG --> LM[Telegram LocationManager]
    BR[Browser] --> GEO[Geolocation API]
    LM --> CTX[Live Context]
    GEO --> CTX
    WX[Open-Meteo] --> CTX

    NX --> API[/api/recommendations v2.1]
    API --> CTX
    CTX --> ENG[Recommendation Engine]
    ENG --> CAT[200-place live catalog]
    ENG --> PLACE[Production Place Experience]

    PLACE --> ROUTE[Yandex Maps]
    PLACE --> CALL[tel:]
    PLACE --> WEB[Official website]
    PLACE --> SHARE[Native / Telegram Share]

    CAT --> PG[(PostgreSQL)]
    PG --> PR[Prisma]

    OSM[OpenStreetMap / Overpass] --> PIPE[Data pipeline]
    WM[Wikimedia / Wikidata] --> PIPE
    OFF[Official sources] --> PIPE
    DG[2GIS Places API optional] --> PIPE
    PIPE --> AUDIT[Sanitize · Dedupe · Audit]
    AUDIT --> CAT
```

Repository boundaries:

```text
app/                          routes + APIs
components/ui/                presentation primitives
features/places/              catalog + place experience + actions
features/recommendations/     ranking domain + server context enrichment
features/plans/               evening-plan flow
features/rooms/               group-room flow
lib/context/                  weather, time, service-area context
lib/location/                 Telegram/browser geolocation client
lib/telegram/                 Telegram platform bridge
data/                          generated catalog + reports
prisma/                        PostgreSQL schema
scripts/                       collection + quality gates
```

## API

### Live context

```http
GET /api/context
GET /api/context?lat=48.48&lon=135.07
```

### Recommendations

```http
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid
```

With optional location:

```http
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid&lat=48.48&lon=135.07&maxDistanceKm=12&limit=5
```

Response version: `v2.1`, context version: `live-v1`.

## Quality gates

Stage 5 adds a dedicated production-place audit on top of the existing recommendation checks.

```bash
npm run test
npm run recommendation:audit
npm run place:audit
npm run typecheck
npm run lint
npm run build
```

`place:audit` runs against all **200** production places and requires:

- 200/200 routeable places;
- 200/200 source-backed places;
- valid verification timestamp for every place.

It separately reports phone CTA coverage, website CTA coverage, production-approved photos and fallback visuals without inventing missing fields.

The recommendation audit remains:

```text
5 moods × 3 budgets × 3 party sizes = 45 scenarios
200-place production catalog
category-diversity checks
0 empty baseline scenarios
```

Full gate:

```bash
npm run check
```

GitHub Actions runs unit tests, recommendation audit, place audit, TypeScript, ESLint and production `next build` on `agent/**`, PRs and `main`.

## Local development

```bash
git clone https://github.com/richmanstudio/kudaidem.git
cd kudaidem
npm install
cp .env.example .env
npm run dev
```

Database:

```bash
npm run db:generate
npm run db:seed
```

## Data operations

```bash
npm run data:finalize
npm run data:collect
npm run data:official-photos
npm run data:2gis
npm run data:sanitize-photos
npm run data:validate
npm run data:audit
```

## Product roadmap

```text
Stage 1  Production foundation             ✅
Stage 2  Live Khabarovsk data layer        ✅
Stage 3  Recommendation Engine v2          ✅
Stage 4  Geolocation & live context        ✅
Stage 5  Production place experience       ✅
Stage 6  Telegram rooms & group voting      →
Stage 7  Analytics + closed beta            →
Stage 8  Khabarovsk public launch           →
```

## Stack

`Next.js 16` · `React 19` · `TypeScript` · `PostgreSQL` · `Prisma 7` · `Telegram Mini Apps` · `Open-Meteo` · `GitHub Actions`

---

<div align="center">
  <strong>DUONIQ</strong><br />
  <sub>Two founders. One clear result.</sub><br /><br />
  <code>#B6FF00</code>
</div>
