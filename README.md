# Куда идём?

Telegram Mini App на Next.js, которое помогает компании быстро решить, куда сходить в Хабаровске.

## Текущий статус

Stage 2 — live Khabarovsk catalog.

Основной MVP-сценарий:

- выбор количества людей, настроения и бюджета;
- recommendation engine;
- один лучший вариант и следующий вариант;
- карточка места с актуальной фотографией и provenance;
- внешний маршрут по координатам/адресу;
- Telegram WebApp bridge и haptics;
- loading / empty / not-found / error states.

## Live data pipeline

Цель Stage 2 — 200 актуальных мест Хабаровска с реальной фотографией для каждого объекта. Каталог хранится в `data/khabarovsk-places.json` и воспроизводимо пересобирается.

```text
OpenStreetMap / Overpass API
        │
        ├── name / category / address
        ├── coordinates / opening_hours / contacts when available
        ├── source timestamp
        └── Wikimedia / Wikidata / official-site photo hints
        │
        ▼
Wikimedia Commons ──► preferred photo with license metadata
        │
        └── fallback: official venue website photo
                       (NEEDS_REVIEW until reuse rights are confirmed)
        │
        ▼
data/khabarovsk-places.json
        │
        ├── data/photo-review.json
        ├── Next.js recommendation catalog
        └── PostgreSQL importer / Prisma
```

OpenStreetMap data is attributed in the user-facing place page and linked to the ODbL/copyright notice. Wikimedia photos store author/license/source metadata. A URL being publicly accessible is not treated as proof of commercial reuse rights.

Public 2GIS HTML pages are **not scraped** by the production pipeline. If 2GIS is added as a provider, it must use the official Places API/Data product with an appropriate access key/subscription and contract-compatible display rights.

Запуск обновления вручную:

```bash
npm install
npm run data:collect
REQUIRE_LIVE_DATA=1 npm run data:validate
```

Для полного photo-rights gate:

```bash
REQUIRE_LIVE_DATA=1 REQUIRE_APPROVED_PHOTOS=1 npm run data:validate
```

GitHub Actions workflow `Refresh Khabarovsk places` сохраняет partial report как artifact даже при недоборе. Каталог коммитится в ветку только если collector и strict validator прошли.

## Photo review

`data/photo-review.json` содержит изображения, найденные на официальных сайтах или других источниках, у которых ещё нет подтверждённой свободной лицензии.

В production `PlaceVisual` по умолчанию показывает только `APPROVED`-изображения. Для внутреннего визуального QA можно временно включить:

```bash
NEXT_PUBLIC_ALLOW_REVIEW_PHOTOS=1
```

Не включать этот флаг в публичном production без проверки прав.

## PostgreSQL / Prisma

Stage 2 содержит модель данных в `prisma/schema.prisma`: `Place`, `PlacePhoto`, provenance источников, author/license metadata и журнал refresh-run.

```bash
cp .env.example .env
npm run db:generate
npm run db:seed
```

`db:seed` импортирует текущий проверенный JSON-каталог в PostgreSQL и деактивирует старые хабаровские записи, которых больше нет в свежем наборе.

## Архитектура

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
  khabarovsk-places.json  generated catalog
  scrape-report.json      generated coverage report
  photo-review.json       generated rights-review queue

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
  validate-places.ts
  import-places.ts
```

Правило: неподтверждённое поле остаётся `null`; UI показывает «уточняется», а не выдумывает цену, рейтинг, график или расстояние.

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
