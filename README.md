<div align="center">
  <img src="./docs/readme-hero.svg" width="100%" alt="Куда идём? — Telegram Mini App by DUONIQ" />

  <br />

  **Не каталог мест. Движок принятия решения о том, куда идти прямо сейчас.**

  `v0.6 · Хабаровск · Telegram Mini App · Next.js 16 · TypeScript · PostgreSQL · Prisma`
</div>

---

## Product

**«Куда идём?»** убирает бесконечное «ну и куда пойдём?». Пользователь задаёт размер компании, настроение и бюджет, приложение учитывает live-контекст и возвращает небольшой набор подходящих вариантов. С Stage 6 этот выбор можно передать всей компании: создать комнату, отправить Telegram-ссылку и получить общий лидер по независимым голосам.

> **Мы выбираем место, чтобы пользователю не пришлось.**

Текущий launch market — **Хабаровск**. Product baseline — собственный live-каталог из **200 мест**.

## Stage 6 · Telegram Rooms & Group Voting

Stage 6 закрывает социальную часть решения:

```text
recommendations
      ↓
create room
      ↓
Telegram invite / deep link
      ↓
friends join
      ↓
yes / no votes
      ↓
live group leader
```

Результат поиска теперь может создать настоящую комнату из топовых рекомендаций. Комната имеет уникальный URL `/room/[id]`; каждый браузер получает стабильный anonymous member ID, участники голосуют независимо, а общий рейтинг синхронизируется каждые 2.5 секунды.

Введены отдельные room domain, API создания/чтения/join/vote, детерминированный tally и Telegram share. Старый статический экран с заранее прописанными Данилой, Аней, Серёжей и Леной больше не является основным room flow.

Текущий room store — process-local baseline для functional preview/single-instance runtime. Он намеренно не выдаётся за durable production storage: следующий infrastructure pass должен заменить adapter на PostgreSQL/Redis для persistence и multi-instance deployment.

Полная спецификация: [`docs/STAGE-6.md`](./docs/STAGE-6.md).

## Stage 5 · Production Place Experience

Stage 5 закрывает путь от рекомендации до реального действия: production place page сохраняет recommendation context, показывает match/confidence, live availability, distance/ETA, подтверждённые price/rating, explainable reasons, provenance и media-rights state. Основные действия — Yandex Maps route, conditional phone/site CTA, native share с Telegram fallback и evening-plan continuation.

Production показывает только `APPROVED` / `OFFICIAL_SOURCE` media; остальные изображения уходят в безопасный фирменный fallback. Все 200 мест routeable и source-backed.

Полная спецификация: [`docs/STAGE-5.md`](./docs/STAGE-5.md).

## Previous stages

- Stage 1 — Production Foundation ✅
- Stage 2 — Live Khabarovsk Data Layer ✅
- Stage 3 — Recommendation Engine v2 ✅
- Stage 4 — Geolocation & Live Context ✅
- Stage 5 — Production Place Experience ✅
- Stage 6 — Telegram Rooms & Group Voting ✅

## Quality gates

CI выполняет unit tests, recommendation audit, place audit, TypeScript, ESLint и production Next.js build. Room domain tests включены в общий test suite начиная с v0.6.

## Stack

Next.js 16 · React 19 · TypeScript · PostgreSQL · Prisma · Telegram Mini App APIs.

## Data principle

Unknown stays unknown. Приложение не выдумывает расписание, цену, рейтинг, координаты, телефон или права на изображения. Источник и freshness остаются частью production UX.

## Documentation

Подробные stage-спецификации и data policy находятся в `docs/` и `data/`.
