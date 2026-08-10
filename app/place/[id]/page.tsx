import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui/topbar";
import { Clock, Navigation, Wallet } from "@/components/ui/icons";
import { PlaceActions } from "@/features/places/components/place-actions";
import { PlaceVisual } from "@/features/places/components/place-visual";
import { getPlace } from "@/features/recommendations/domain/recommend";
import {
  filtersToSearchParams,
  parseSearchRecord,
} from "@/features/recommendations/domain/search-params";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlacePage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = await searchParams;
  const place = getPlace(id);

  if (!place) notFound();

  const query = filtersToSearchParams(parseSearchRecord(raw));

  return (
    <div className="screen">
      <Topbar title="Место" />
      <PlaceVisual place={place} compact />

      <section className="place-copy">
        <h1>{place.name}</h1>
        <div className="subline">{place.category}</div>
        <p>{place.description}</p>
      </section>

      <div className="stats">
        <div className="stat">
          <Wallet /> {place.price != null ? `Средний чек — ${place.price.toLocaleString("ru-RU")} ₽` : "Средний чек уточняется"}
        </div>
        <div className="stat">
          <Clock /> {place.closesAt ? `Работает до ${place.closesAt}` : "Проверьте актуальный график перед визитом"}
        </div>
        <div className="stat">
          <Navigation /> {place.address || "Хабаровск"}
        </div>
      </div>

      <div className="map-card" aria-label="Местоположение">
        <div className="map-pin"><span /></div>
      </div>

      {place.sourceUrl ? (
        <div className="live-source-note">
          Данные проверены {place.verifiedAt ? new Date(place.verifiedAt).toLocaleDateString("ru-RU") : "недавно"}.{" "}
          <a href={place.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a>
        </div>
      ) : null}

      <PlaceActions
        placeName={place.name}
        address={place.address}
        latitude={place.latitude}
        longitude={place.longitude}
        planHref={`/plan?place=${place.id}&${query.toString()}`}
      />
    </div>
  );
}
