# Куда идём?

Telegram Mini App на Next.js, которое помогает компании быстро решить, куда сходить в Хабаровске.

## Текущий статус

Stage 1 — production foundation.

Работает основной MVP-сценарий:

- выбор количества людей, настроения и бюджета;
- рекомендация одного лучшего места;
- следующий вариант без каталога;
- карточка места и внешний маршрут;
- план на вечер;
- демо-комната с голосованием;
- Telegram WebApp bridge и haptics;
- API рекомендаций;
- loading / empty / not-found / error states;
- минимальное логирование client-side ошибок в server logs.

> Каталог мест пока демонстрационный. Stage 2 заменит его на проверенную базу реальных мест Хабаровска.

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

features/
  places/
    components/
    data/
  plans/
    components/
  recommendations/
    components/
    domain/
  rooms/
    components/

lib/
  observability/          клиентский error reporting
  telegram/               изолированная Telegram WebApp интеграция
```

Правило: `app` связывает features, но бизнес-логика не живёт в route-файлах.

## Запуск

```bash
npm install
npm run dev
```

Проверка перед merge:

```bash
npm run check
```

Она запускает TypeScript, ESLint и production build.

## Telegram

Для production Mini App нужен HTTPS URL. Telegram SDK подключается в root layout. В обычном браузере приложение продолжает работать: Telegram-specific функции деградируют в безопасные browser fallback.

## API

```text
GET /api/recommendations?city=Хабаровск&party=4&mood=fun&budget=mid
POST /api/client-error
```

Поисковые параметры нормализуются перед использованием — неизвестные mood/budget/city не попадают напрямую в recommendation engine.

## Следующий этап

Stage 2:

1. PostgreSQL;
2. модель `Place`;
3. verified dataset Хабаровска;
4. импорт/админ-редактирование;
5. замена `features/places/data/demo-places.ts` на repository/data source.
