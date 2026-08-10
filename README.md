# Куда идём?

Telegram Mini App на Next.js, которое помогает компании быстро решить, куда сходить в Хабаровске.

## Текущий статус

Stage 2 — live Khabarovsk catalog.

Проверенный generated dataset:

- 200/200 актуальных мест Хабаровска;
- 507 найденных OSM POI, 502 уникальных кандидата;
- 200/200 записей с координатами и provenance источника;
- 93 места с указанным website/contact source;
- 112 мест с `opening_hours`;
- 44/200 валидных raster-фото после media sanitizer;
- 11 фото имеют открытую лицензию и статус `APPROVED`;
- 33 фото требуют rights review;
- 156 мест пока используют брендированный fallback visual.

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
        ├── current named POI candidates
        ├── name / category / address
        ├── coordinates / opening_hours / contacts when available
        └── source timestamp / URL
        │
        ▼
balanced exact 200-place catalog
        │
        ├── optional licensed 2GIS Places API metadata enrichment
        │      └── external_content.main_photo_url retained as provider media
        │
        ▼
photo enrichment
        ├── Wikimedia Commons / Wikidata P18
        │     └── author + license metadata
        └── official venue website
              └── NEEDS_REVIEW until reuse rights are confirmed
        │
        ▼
media sanitizer
        └── rejects HTML URLs, SVG/system assets and inaccessible non-raster media
```

OpenStreetMap data is attributed in the user-facing place page and linked to the ODbL/copyright notice. Wikimedia photos store author/license/source metadata. A URL being publicly accessible is not treated as proof of commercial reuse rights.

Public 2GIS HTML pages are **not scraped** by the production pipeline. The optional 2GIS integration uses the official Places API and activates only when `DGIS_API_KEY` is configured. API-provided `main_photo_url` is stored separately as `twoGisMainPhotoUrl`; it is promoted to the public `imageUrl` only when `DGIS_MEDIA_RIGHTS_APPROVED=1` is explicitly set after contract/subscription media rights are confirmed.

A free 2GIS demo key can be created in Platform Manager for testing. Production use requires the appropriate subscription/key and confirmed media-display rights.

## Data commands

```bash
npm install
npm run data:finalize          # balanced exact 200 current places + media/provider hints
npm run data:collect           # Wikimedia/Wikidata and official-site metadata/photo enrichment
npm run data:official-photos   # deeper gallery/about scan on official venue sites
npm run data:2gis              # optional licensed 2GIS API metadata/main-photo enrichment
npm run data:sanitize-photos   # validate that retained media URLs are real raster images
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

GitHub Actions workflow `Refresh Khabarovsk places` runs the same pipeline, preserves `khabarovsk-places.json`, `scrape-report.json`, `photo-review.json` and `2gis-report.json` as artifacts, and commits the base catalog once the 200-place gate is green. Photo coverage is reported separately and is measured after sanitization.

## Photo review

`data/photo-review.json` contains both places without a photo and images found on official/other sources whose reuse rights are not yet approved.

In production `PlaceVisual` shows only `APPROVED` images. For internal visual QA only:

```bash
NEXT_PUBLIC_ALLOW_REVIEW_PHOTOS=1
```

Do not enable this flag in public production before rights review.

## PostgreSQL / Prisma

Stage 2 contains `Place`, `PlacePhoto`, source provenance, optional licensed 2GIS match/main-photo metadata, photo author/license metadata and refresh history in `prisma/schema.prisma`.

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
  2gis-report.json        optional official API enrichment report

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
  finalize-khabarovsk-catalog.ts
  enrich-2gis-api.ts
  collect-khabarovsk.ts
  deep-official-photos.ts
  sanitize-photo-catalog.ts
  validate-places.ts
  audit-catalog.ts
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
