# Куда идём?

Telegram Mini App на Next.js, которое помогает компании быстро решить, куда сходить в Хабаровске.

## Текущий статус

Stage 2 — live Khabarovsk catalog.

Основной MVP-сценарий:

- выбор количества людей, настроения и бюджета;
- recommendation engine;
- один лучший вариант и следующий вариант;
- карточка места с provenance данных и фотографии;
- внешний маршрут по координатам/адресу;
- Telegram WebApp bridge и haptics;
- loading / empty / not-found / error states.

## Live data pipeline

Stage 2 разделён на два независимых качества данных:

1. **Catalog gate:** ровно 200 актуальных мест Хабаровска с названием, категорией, координатами, источником и датой проверки.
2. **Photo gate:** реальная фотография для каждого из 200 мест с понятным источником и статусом прав.

Каталог хранится в `data/khabarovsk-places.json` и воспроизводимо пересобирается.

```text
OpenStreetMap / Overpass API
        │
        ├── 500+ current named POI candidates
        ├── name / category / address
        ├── coordinates / opening_hours / contacts when available
        └── source timestamp / URL
        │
        ├──────────────► exact 200-place catalog
        │
        └── photo enrichment
              ├── Wikimedia Commons / Wikidata P18
              │     └── author + license metadata
              └── official venue website
                    └── NEEDS_REVIEW until reuse rights are confirmed
```

OpenStreetMap data is attributed in the user-facing place page and linked to the ODbL/copyright notice. Wikimedia photos store author/license/source metadata. A URL being publicly accessible is not treated as proof of commercial reuse rights.

Public 2GIS HTML pages are **not scraped** by the production pipeline. If 2GIS is added as a provider, it must use the official Places API/Data product with an appropriate access key/subscription and contract-compatible display rights.

## Data commands

```bash
npm install
npm run data:collect    # photo enrichment pass; writes partial photo coverage
npm run data:finalize   # builds exactly 200 current places, retaining enriched photos
REQUIRE_LIVE_DATA=1 npm run data:validate
```

Photo-completeness gate:

```bash
REQUIRE_LIVE_DATA=1 REQUIRE_PHOTOS=1 npm run data:validate
```

Full photo-rights gate:

```bash
REQUIRE_LIVE_DATA=1 REQUIRE_PHOTOS=1 REQUIRE_APPROVED_PHOTOS=1 npm run data:validate
```

GitHub Actions workflow `Refresh Khabarovsk places` always attempts photo enrichment, then finalizes and validates the 200-place catalog. It preserves `khabarovsk-places.json`, `scrape-report.json` and `photo-review.json` as an artifact and commits the base catalog once the 200-place gate is green. Photo coverage is reported separately.

## Photo review

`data/photo-review.json` contains both places without a photo and images found on official/other sources whose reuse rights are not yet approved.

In production `PlaceVisual` shows only `APPROVED` images. For internal visual QA only:

```bash
NEXT_PUBLIC_ALLOW_REVIEW_PHOTOS=1
```

Do not enable this flag in public production before rights review.

## PostgreSQL / Prisma

Stage 2 contains `Place`, `PlacePhoto`, provenance fields, photo author/license metadata and refresh history in `prisma/schema.prisma`.

```bash
cp .env.example .env
npm run db:generate
npm run db:seed
```

`db:seed` imports all 200 catalog records. A place may legitimately have no approved photo yet; in that case no `PlacePhoto` row is created and the UI uses the branded fallback visual.

## Architecture

```text
app/
  api/
  place/
  plan/
  result/
  room/

components/
  ui/

data/
  khabarovsk-places.json  generated 200-place catalog
  scrape-report.json      generated coverage report
  photo-review.json       generated photo backlog / rights queue

features/
  places/
    components/
    data/catalog.ts
  plans/
  recommendations/
    domain/
  rooms/

lib/
  observability/
  telegram/

prisma/
  schema.prisma

scripts/
  collect-khabarovsk.ts
  finalize-khabarovsk-catalog.ts
  validate-places.ts
  import-places.ts
```

Правило: неподтверждённое поле остаётся `null`; UI показывает «уточняется», а не выдумывает цену, рейтинг, график, расстояние или фотографию.

## Запуск приложения

```bash
npm install
npm run dev
```

Проверка перед merge:

```bash
npm run check
```

Она генерирует Prisma Client, валидирует текущий каталог, запускает TypeScript, ESLint и production Next.js build.

## Telegram

Для production Mini App нужен HTTPS URL. Telegram SDK подключается в root layout. В обычном браузере приложение продолжает работать через безопасные browser fallback.

## API

```text
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid
POST /api/client-error
```
