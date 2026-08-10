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

function sourceLabel(source: string | null | undefined) {
  if (source === "OPENSTREETMAP") return "OpenStreetMap contributors";
  if (source === "TWO_GIS") return "2ГИС API";
  if (source === "MANUAL") return "редакция «Куда идём?»";
  return "источник места";
}

export default async function PlacePage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = await searchParams;
  const place = getPlace(id);

  if (!place) notFound();

  const query = filtersToSearchParams(parseSearchRecord(raw));
  const isOsm = place.source === "OPENSTREETMAP";

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
          Данные: <a href={place.sourceUrl} target="_blank" rel="noreferrer">{sourceLabel(place.source)}</a>.
          {isOsm ? (
            <> Лицензия ODbL: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">условия и атрибуция</a>.</>
          ) : null}{" "}
          Проверено {place.verifiedAt ? new Date(place.verifiedAt).toLocaleDateString("ru-RU") : "недавно"}.
        </div>
      ) : null}

      {place.imageRights === "APPROVED" && place.imageSourceUrl ? (
        <div className="live-source-note">
          Фото: {place.imageAuthor ? `${place.imageAuthor}. ` : ""}
          <a href={place.imageSourceUrl} target="_blank" rel="noreferrer">источник изображения</a>
          {place.imageLicense ? ` · ${place.imageLicense}` : ""}
          {place.imageLicenseUrl ? <> · <a href={place.imageLicenseUrl} target="_blank" rel="noreferrer">лицензия</a></> : null}
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
