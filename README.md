# Куда идём?

Telegram Mini App на Next.js, которое помогает компании быстро решить, куда сходить в Хабаровске.

## Текущий статус

Stage 2 — live Khabarovsk catalog.

Основной MVP-сценарий:

- выбор количества людей, настроения и бюджета;
- recommendation engine;
- один лучший вариант и следующий вариант;
- карточка места, актуальная фотография и источник данных;
- внешний маршрут по координатам/адресу;
- Telegram WebApp bridge и haptics;
- loading / empty / not-found / error states.

## Live data pipeline

Каталог хранится в `data/khabarovsk-places.json` и воспроизводимо пересобирается crawler-ом. Цель Stage 2 — 200 актуальных мест Хабаровска с фотографией для каждого объекта.

```text
2GIS search / firm pages
        │
        ├── name / category / address
        ├── rating / reviews / average check when exposed
        ├── work time / contacts / coordinates when exposed
        └── source URL
        │
        ▼
official venue website ──► preferred photo
        │
        └── fallback: 2GIS gallery photo (rights review required)
        │
        ▼
data/khabarovsk-places.json
        │
        ├── Next.js recommendation catalog
        └── PostgreSQL importer / Prisma
```

Каждая запись содержит `sourceUrl`, `verifiedAt`, `imageSourceUrl` и `imageRights`. Мы не считаем пользовательские/агрегаторные фотографии автоматически лицензированными для коммерческого переиспользования: они остаются со статусом `THIRD_PARTY_UNKNOWN`, пока не будут заменены официальным материалом или явно одобрены.

Запуск обновления вручную:

```bash
npm install
npm run data:scrape
REQUIRE_LIVE_DATA=1 npm run data:validate
```

GitHub Actions workflow `Refresh Khabarovsk places` выполняет тот же pipeline и коммитит обновлённый каталог обратно в рабочую ветку.

## PostgreSQL / Prisma

Stage 2 уже содержит production-ready модель данных в `prisma/schema.prisma`: `Place`, `PlacePhoto`, статусы источника/прав на изображение и журнал refresh-run.

```bash
cp .env.example .env
npm run db:generate
npm run db:seed
```

`db:seed` импортирует текущий проверенный JSON-каталог в PostgreSQL и деактивирует старые хабаровские записи, которых больше нет в свежем наборе.

## Архитектура

```text
app/
  api/                    HTTP endpoints и error ingest
  place/                  route pages
  plan/
  result/
  room/

components/
  ui/                     общие визуальные примитивы

data/
  khabarovsk-places.json  generated verified catalog
  scrape-report.json      generated coverage report

features/
  places/
    components/
    data/catalog.ts       live catalog adapter
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
  scrape-khabarovsk.ts
  validate-places.ts
  import-places.ts
```

Правило: неподтверждённое поле остаётся `null`; UI показывает «уточняется», а не выдумывает цену, график или расстояние.

## Запуск приложения

```bash
npm install
npm run dev
```

Проверка перед merge:

```bash
npm run check
```

Она генерирует Prisma Client, валидирует каталог, запускает TypeScript, ESLint и production Next.js build.

## Telegram

Для production Mini App нужен HTTPS URL. Telegram SDK подключается в root layout. В обычном браузере приложение продолжает работать через безопасные browser fallback.

## API

```text
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid
POST /api/client-error
```
