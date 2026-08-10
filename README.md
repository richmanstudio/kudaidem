<div align="center">
  <img src="./docs/readme-hero.svg" width="100%" alt="Куда идём? — Telegram Mini App by DUONIQ" />

  <br />

  **Не каталог мест. Движок принятия решения о том, куда идти прямо сейчас.**

  `v0.4 · Хабаровск · Telegram Mini App · Next.js 16 · TypeScript · PostgreSQL · Prisma`
</div>

---

## Product

**«Куда идём?»** убирает бесконечное «ну и куда пойдём?». Пользователь задаёт размер компании, настроение и бюджет, а приложение учитывает реальную ситуацию вокруг него и возвращает небольшой набор подходящих вариантов вместо сотен карточек каталога.

> **Мы выбираем место, чтобы пользователю не пришлось.**

Текущий launch market — **Хабаровск**. Product baseline — собственный live-каталог из **200 мест**.

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

### Location

В Telegram Mini App используется нативный `Telegram.WebApp.LocationManager` (Bot API 8.0+). Если он недоступен, приложение переходит на browser Geolocation API.

- permission только после действия пользователя;
- Telegram settings flow для ранее запрещённого доступа;
- browser fallback;
- session-only location cache на 10 минут;
- координаты округляются до 3 знаков (~100 м);
- геолокацию можно отключить прямо на Home screen;
- без геолокации весь основной flow продолжает работать.

Launch-area guard: **70 км от центра Хабаровска**. Если пользователь находится дальше, погода берётся по Хабаровску, а distance ranking выключается — удалённая позиция не превращает выдачу в пустой список.

### Live weather

Current weather приходит через Open-Meteo и нормализуется в продуктовые состояния:

`clear · cloudy · rain · snow · storm · extreme · unknown`

Weather provider является optional signal. При его сбое engine продолжает работу в degraded mode.

### Context-aware behavior

- дождь/снег повышают indoor варианты;
- хорошая погода может повышать outdoor;
- шторм/экстремальная погода hard-reject outdoor-only сценарии;
- ночью outdoor-only понижается;
- nightlife лучше ранжируется вечером и ночью;
- утром nightlife получает штраф;
- UI показывает текущую погоду, температуру и daypart.

Полная спецификация: [`docs/STAGE-4.md`](./docs/STAGE-4.md).

## Recommendation Engine v2.1

Сначала применяются **hard constraints**:

- active + выбранный город;
- вместимость компании;
- подтверждённо закрытые места исключаются;
- optional max distance;
- explicit exclusions;
- outdoor-only места исключаются при severe live weather.

Затем ranking считает девять сигналов:

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

Каждая рекомендация содержит:

```ts
{
  score,
  match,
  confidence,
  availability,
  distanceKm,
  travelMinutes,
  reasons,
  warnings,
  breakdown: {
    mood,
    budget,
    group,
    distance,
    availability,
    context,
    quality,
    freshness,
    novelty
  }
}
```

Если строгая выдача пуста, engine может ослабить **только бюджет**. Город, размер компании, закрытые места, distance и severe-context constraints не снимаются.

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

Public URL не считается разрешением на reuse.

- `APPROVED` — подтверждённый источник/права;
- `NEEDS_REVIEW` — media найдено, но reuse требует проверки;
- source metadata хранится отдельно;
- production UI может показывать только разрешённые изображения.

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
features/places/              live place catalog + UI
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

Response:

```ts
{
  version: "live-v1",
  context: {
    daypart,
    locationSource,
    inServiceArea,
    weather,
    degraded,
    warnings
  }
}
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

Optional query parameters:

```text
at=ISO_DATE
lat=LATITUDE
lon=LONGITUDE
maxDistanceKm=NUMBER
exclude=id1,id2
seen=id1,id2
prefer=restaurant,bowling
limit=1..20
```

## Quality gates

Automated tests cover Stage 3 + Stage 4 behavior:

- opening-hours parser in Khabarovsk time;
- party hard filter;
- closed-place rejection;
- controlled budget relaxation;
- mood ranking;
- geodistance filtering;
- exclude safety;
- weather-code classification;
- Khabarovsk service area;
- daypart calculation;
- rain preferring indoor;
- severe weather outdoor rejection.

Production-catalog audit remains mandatory:

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

GitHub Actions runs tests, recommendation audit, TypeScript, ESLint and production `next build` on `agent/**`, PRs and `main`.

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
Stage 5  Production place experience        →
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
