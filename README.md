<div align="center">
  <img src="./docs/readme-hero.svg" width="100%" alt="Куда идём? — Telegram Mini App by DUONIQ" />

  <br />

  **Не каталог мест. Движок принятия решения о том, куда идти прямо сейчас.**

  `Хабаровск · Telegram Mini App · Next.js 16 · TypeScript · PostgreSQL · Prisma`
</div>

---

## Product

**«Куда идём?»** убирает самую скучную часть вечера — бесконечное «ну и куда пойдём?». Пользователь задаёт город, размер компании, настроение и бюджет, а приложение возвращает небольшой набор действительно подходящих вариантов вместо сотен карточек каталога.

Главный принцип продукта:

> **Мы выбираем место, чтобы пользователю не пришлось.**

Сейчас продукт сфокусирован на Хабаровске и работает поверх собственного live-каталога из **200 мест**.

## Recommendation Engine v2

Stage 3 заменил простой сортировщик на объяснимый decision engine.

Сначала применяются **hard constraints**:

- место активно и относится к выбранному городу;
- вмещает выбранное количество людей;
- не подтверждено как закрытое в выбранный момент;
- укладывается в максимальную дистанцию, если передана геолокация;
- исключённые пользователем места не возвращаются через fallback.

После этого кандидаты ранжируются по восьми сигналам:

| Signal | Weight |
|---|---:|
| Mood match | 28% |
| Budget | 18% |
| Group compatibility | 12% |
| Distance | 12% |
| Availability | 10% |
| Quality | 10% |
| Data freshness | 5% |
| Novelty | 5% |

Движок отдельно считает `score`, `match` и `confidence`. Если какого-то факта нет — например, не подтверждён средний чек или рейтинг — это уменьшает уверенность, а не заменяется выдуманным значением.

Каждая рекомендация содержит:

```ts
{
  match,
  confidence,
  availability,
  distanceKm,
  travelMinutes,
  reasons,
  warnings,
  breakdown
}
```

Если строгая выдача пуста, engine может ослабить **только бюджет**. Ограничения города, размера компании, закрытого места и максимальной дистанции не снимаются.

### Контекст, который уже понимает v2

```text
city
party size
mood
budget
current / requested time
latitude + longitude
maximum distance
excluded places
previously seen places
preferred categories
```

## Live catalog

Stage 2 создал воспроизводимый data layer для Хабаровска.

**Текущий baseline:**

- 200 / 200 мест;
- 200 / 200 media URL + source provenance;
- координаты для каталога;
- source URL и `verifiedAt`;
- категории и recommendation tags;
- PostgreSQL / Prisma data model;
- automatic refresh, dedupe, media sanitizer и audit pipeline.

Не все дополнительные поля одинаково полны. Телефоны, графики, сайты, чеки и рейтинги обогащаются независимо. Неподтверждённое поле остаётся `null`.

### Media rights

Все карточки имеют визуальный media candidate, но это **не означает**, что все изображения юридически очищены для публичного коммерческого использования.

- изображения с подтверждённым происхождением могут иметь `APPROVED`;
- search / third-party media сохраняются как `NEEDS_REVIEW`;
- для каждого изображения сохраняется источник;
- публичный URL сам по себе не считается разрешением на reuse.

Production UI может ограничивать показ изображений по `ImageRights`.

## Architecture

```mermaid
flowchart TD
    TG[Telegram Mini App] --> NX[Next.js App Router]
    NX --> API[/api/recommendations v2]
    API --> ENG[Recommendation Engine v2]
    ENG --> CAT[200-place live catalog]
    ENG --> CTX[Time · Budget · Party · Mood · Geo]

    CAT --> PG[(PostgreSQL)]
    PG --> PR[Prisma]

    OSM[OpenStreetMap / Overpass] --> PIPE[Data enrichment pipeline]
    WM[Wikimedia / Wikidata] --> PIPE
    OFF[Official venue sources] --> PIPE
    DG[2GIS Places API · optional] --> PIPE
    PIPE --> AUDIT[Sanitize · Dedupe · Audit]
    AUDIT --> CAT
```

Repository boundaries:

```text
app/                          Next.js routes + API
components/ui/                shared presentation primitives
features/places/              live place catalog + place UI
features/recommendations/     Recommendation Engine v2
features/plans/               evening plan flow
features/rooms/               group-room flow
lib/telegram/                 Telegram platform bridge
lib/observability/            client/server diagnostics
data/                          generated Khabarovsk catalog + reports
prisma/                        PostgreSQL schema + migrations
scripts/                       collection, enrichment and quality gates
```

## API v2

Basic request:

```http
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid
```

Context-aware request:

```http
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid&lat=48.48&lon=135.07&maxDistanceKm=8&limit=5
```

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

Response includes `version`, `mode`, diagnostics and explainable ranked results.

## Quality gates

Recommendation Engine v2 has two test layers.

**Unit suite:**

- opening-hours parsing in Khabarovsk time;
- party-size hard filtering;
- closed-place rejection;
- controlled budget relaxation;
- mood ranking;
- geodistance filtering;
- exclude safety.

**Live catalog audit:** 45 deterministic scenarios across all current moods, budgets and party sizes.

```text
5 moods × 3 budgets × 3 party sizes = 45 scenarios
200-place production catalog
45 / 45 category-diversity checks
0 empty baseline scenarios
```

Run everything before merge:

```bash
npm run check
```

Or recommendation checks separately:

```bash
npm run test
npm run recommendation:audit
```

GitHub Actions additionally runs tests, recommendation audit, TypeScript, ESLint and production `next build` for every `agent/**` branch and PR to `main`.

## Local development

```bash
git clone https://github.com/richmanstudio/kudaidem.git
cd kudaidem
npm install
cp .env.example .env
npm run dev
```

Database setup:

```bash
npm run db:generate
npm run db:seed
```

Full project check:

```bash
npm run check
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

Strict catalog + media check:

```bash
REQUIRE_LIVE_DATA=1 REQUIRE_PHOTOS=1 npm run data:validate
```

The data pipeline deliberately prefers an unknown field over false precision.

## Product roadmap

```text
Stage 1  Production foundation             ✅
Stage 2  Live Khabarovsk data layer        ✅
Stage 3  Recommendation Engine v2          ✅
Stage 4  Geolocation & live context         →
Stage 5  Production place experience        →
Stage 6  Telegram rooms & group voting      →
Stage 7  Analytics + closed beta            →
Stage 8  Khabarovsk public launch           →
```

## Stack

`Next.js 16` · `React 19` · `TypeScript` · `PostgreSQL` · `Prisma 7` · `Telegram WebApp` · `GitHub Actions`

---

<div align="center">
  <strong>DUONIQ</strong><br />
  <sub>Two founders. One clear result.</sub><br /><br />
  <code>#B6FF00</code>
</div>
