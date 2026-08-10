import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui/topbar";
import { Clock, Navigation, Wallet } from "@/components/ui/icons";
import { PlaceActions } from "@/features/places/components/place-actions";
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
      <div className="place-visual compact-visual">
        <div className="visual-lines" />
        <div className="visual-word">{place.accent}</div>
      </div>

      <section className="place-copy">
        <h1>{place.name}</h1>
        <div className="subline">{place.category}</div>
        <p>{place.description}</p>
      </section>

      <div className="stats">
        <div className="stat"><Wallet /> Средний чек — {place.price.toLocaleString("ru-RU")} ₽</div>
        <div className="stat"><Clock /> Работает до {place.closesAt}</div>
        <div className="stat"><Navigation /> {place.travelMinutes} минут на машине</div>
      </div>

      <div className="map-card" aria-label="Схематичная карта">
        <div className="map-pin"><span /></div>
      </div>

      <PlaceActions
        placeName={place.name}
        planHref={`/plan?place=${place.id}&${query.toString()}`}
      />
    </div>
  );
}
