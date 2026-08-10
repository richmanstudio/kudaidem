import Link from "next/link";
import { Topbar } from "@/components/ui/topbar";
import { EmptyState } from "@/components/ui/screen-state";
import { Clock, Navigation, Sparkles, Users, Wallet } from "@/components/ui/icons";
import { PlaceVisual } from "@/features/places/components/place-visual";
import { CreateRoomButton } from "@/features/rooms/components/create-room-button";
import { filtersToSearchParams, parseSearchRecord } from "@/features/recommendations/domain/search-params";
import { recommendWithLiveContext } from "@/features/recommendations/server/recommend-with-context";
import type { WeatherKind } from "@/lib/context/types";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const weatherLabels: Record<WeatherKind, string> = { clear: "ясно", cloudy: "облачно", rain: "дождь", snow: "снег", storm: "гроза", extreme: "экстремальная погода", unknown: "погода уточняется" };
const daypartLabels = { morning: "утро", day: "день", evening: "вечер", night: "ночь" } as const;

export default async function ResultPage({ searchParams }: Props) {
  const raw = await searchParams;
  const initialFilters = parseSearchRecord(raw);
  const index = Math.max(0, Number(typeof raw.i === "string" ? raw.i : 0) || 0);
  const live = await recommendWithLiveContext(initialFilters);
  const filters = live.filters;
  const recommendation = live.recommendation;
  const ranked = recommendation.results;

  if (ranked.length === 0) return <div className="screen"><Topbar title="Результат" /><EmptyState title="Пока ничего не нашли" description="Измените параметры поиска — мы не будем показывать закрытое, слишком дорогое, далёкое или неподходящее по текущим условиям место только ради результата." actionHref="/" actionLabel="Изменить параметры" /></div>;

  const place = ranked[index % ranked.length];
  const nextIndex = (index + 1) % ranked.length;
  const base = filtersToSearchParams(filters);
  const weather = live.context.weather;
  const contextText = weather ? `${weatherLabels[weather.kind]}${weather.temperatureC != null ? ` · ${Math.round(weather.temperatureC)} °C` : ""} · ${daypartLabels[live.context.daypart]}` : `${daypartLabels[live.context.daypart]} · погода временно недоступна`;

  return <div className="screen">
    <Topbar title="Лучший вариант" />
    <PlaceVisual place={place} match={place.match} />
    <section className="result-copy">
      <div className="eyebrow">{place.category}</div><h1>{place.name}</h1>
      <div className="match"><Sparkles width={20} /><span>Подходит вам на <strong>{place.match}%</strong></span></div>
      <div className="match"><Clock width={18} /><span>Сейчас: {contextText}</span></div>
      {place.reasons.length > 0 && <p className="subline">Почему: {place.reasons.slice(0, 2).join(" · ")}</p>}
      {recommendation.mode === "relaxed-budget" && <p className="notice">Точных вариантов в бюджете не осталось — показываем ближайший разумный запасной.</p>}
      {live.context.locationSource === "city-center" && initialFilters.latitude != null && <p className="notice">Вы сейчас вне зоны запуска Хабаровска — расстояние считаем не от вашей геопозиции.</p>}
    </section>
    <div className="stats">
      <div className="stat"><Users /> {filters.party} человека</div>
      <div className="stat"><Wallet /> {place.price != null ? `≈ ${place.price.toLocaleString("ru-RU")} ₽ / чел` : "Средний чек уточняется"}</div>
      <div className="stat"><Clock /> {place.availability === "open" ? "Открыто сейчас" : (place.closesAt ? `График до ${place.closesAt}` : "График — в карточке места")}</div>
      <div className="stat"><Navigation /> {place.travelMinutes != null ? `≈ ${place.travelMinutes} минут от вас` : (place.address || "Хабаровск")}</div>
    </div>
    <div className="button-row bottom-action">
      <Link className="primary-button" href={`/place/${place.id}?${base.toString()}`}>Идём!</Link>
      <Link className="secondary-button" href={`/result?${base.toString()}&i=${nextIndex}`}>Другой вариант</Link>
      <CreateRoomButton placeIds={ranked.slice(0, 6).map((item) => item.id)} />
    </div>
  </div>;
}
