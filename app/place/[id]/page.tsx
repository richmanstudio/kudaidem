import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui/topbar";
import { Clock, Navigation, Sparkles, Wallet } from "@/components/ui/icons";
import { PlaceActions } from "@/features/places/components/place-actions";
import { PlaceVisual } from "@/features/places/components/place-visual";
import {
  availabilityLabel,
  confidenceLabel,
  decisionFacts,
  imageIsProductionApproved,
} from "@/features/places/domain/experience";
import { availabilityAt, getPlace } from "@/features/recommendations/domain/recommend";
import {
  filtersToSearchParams,
  parseSearchRecord,
} from "@/features/recommendations/domain/search-params";
import { recommendWithLiveContext } from "@/features/recommendations/server/recommend-with-context";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sourceLabel(source: string | null | undefined) {
  if (source === "OPENSTREETMAP") return "OpenStreetMap contributors";
  if (source === "TWO_GIS") return "2ГИС API";
  if (source === "MANUAL") return "редакция «Куда идём?»";
  if (source === "OFFICIAL_SITE") return "официальный сайт";
  return "источник места";
}

export default async function PlacePage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = await searchParams;
  const place = getPlace(id);
  if (!place) notFound();

  const parsedFilters = parseSearchRecord(raw);
  const live = await recommendWithLiveContext(parsedFilters);
  const query = filtersToSearchParams(live.filters);
  const ranked = live.recommendation.results.find((item) => item.id === id);
  const availability = ranked?.availability ?? availabilityAt(place, new Date(live.context.at));
  const facts = ranked ? decisionFacts(ranked) : [];
  const approvedPhoto = imageIsProductionApproved(place.imageRights);
  const verified = place.verifiedAt ? new Date(place.verifiedAt).toLocaleDateString("ru-RU") : null;

  return (
    <div className="screen place-experience">
      <Topbar title="Место" />
      <PlaceVisual place={place} match={ranked?.match} compact />

      <section className="place-copy production-place-copy">
        <div className="eyebrow">{place.category}</div>
        <h1>{place.name}</h1>
        {ranked ? (
          <div className="place-confidence">
            <Sparkles width={18} />
            <strong>{ranked.match}%</strong>
            <span>{confidenceLabel(ranked.confidence)}</span>
          </div>
        ) : null}
        {place.description ? <p>{place.description}</p> : null}
      </section>

      {facts.length ? (
        <div className="fact-strip" aria-label="Ключевые факты">
          {facts.map((fact) => <span key={fact}>{fact}</span>)}
        </div>
      ) : null}

      {ranked?.reasons.length ? (
        <section className="decision-card">
          <div className="decision-title">Почему сюда</div>
          <ul>
            {ranked.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {ranked.warnings.length ? (
            <div className="decision-warning">{ranked.warnings.slice(0, 2).join(" · ")}</div>
          ) : null}
        </section>
      ) : null}

      <div className="stats place-stats">
        <div className="stat">
          <Clock /> {availabilityLabel(availability, place.closesAt)}
        </div>
        <div className="stat">
          <Wallet /> {place.price != null ? `≈ ${place.price.toLocaleString("ru-RU")} ₽ / человек` : "Средний чек уточняется"}
        </div>
        <div className="stat">
          <Navigation /> {ranked?.travelMinutes != null ? `≈ ${ranked.travelMinutes} минут от вас` : (place.address || "Хабаровск")}
        </div>
      </div>

      <section className="location-card" aria-label="Адрес места">
        <div>
          <div className="location-label">Адрес</div>
          <strong>{place.address || "Хабаровск"}</strong>
        </div>
        {ranked?.distanceKm != null ? <span>{ranked.distanceKm.toFixed(1)} км</span> : null}
      </section>

      <section className="trust-card">
        <div className="trust-row">
          <span>Данные</span>
          <strong>{place.sourceUrl ? sourceLabel(place.source) : "редакционная база"}</strong>
        </div>
        <div className="trust-row">
          <span>Проверено</span>
          <strong>{verified || "недавно"}</strong>
        </div>
        <div className="trust-row">
          <span>Фото</span>
          <strong>{approvedPhoto ? "разрешено для production" : "требует проверки прав"}</strong>
        </div>
        {place.sourceUrl ? (
          <a className="trust-link" href={place.sourceUrl} target="_blank" rel="noreferrer">Открыть источник данных</a>
        ) : null}
      </section>

      {approvedPhoto && place.imageSourceUrl ? (
        <div className="live-source-note">
          Фото: {place.imageAuthor ? `${place.imageAuthor}. ` : ""}
          <a href={place.imageSourceUrl} target="_blank" rel="noreferrer">источник</a>
          {place.imageLicense ? ` · ${place.imageLicense}` : ""}
          {place.imageLicenseUrl ? <> · <a href={place.imageLicenseUrl} target="_blank" rel="noreferrer">лицензия</a></> : null}
        </div>
      ) : null}

      <PlaceActions
        placeId={place.id}
        placeName={place.name}
        address={place.address}
        latitude={place.latitude}
        longitude={place.longitude}
        phone={place.phone}
        website={place.website}
        planHref={`/plan?place=${place.id}&${query.toString()}`}
      />
    </div>
  );
}
