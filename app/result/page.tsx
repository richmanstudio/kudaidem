import Link from "next/link";
import { Topbar } from "@/components/ui/topbar";
import { EmptyState } from "@/components/ui/screen-state";
import { Clock, Navigation, Sparkles, Users, Wallet } from "@/components/ui/icons";
import { rankPlaces } from "@/features/recommendations/domain/recommend";
import {
  filtersToSearchParams,
  parseSearchRecord,
} from "@/features/recommendations/domain/search-params";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResultPage({ searchParams }: Props) {
  const raw = await searchParams;
  const filters = parseSearchRecord(raw);
  const index = Math.max(
    0,
    Number(typeof raw.i === "string" ? raw.i : 0) || 0,
  );
  const ranked = rankPlaces(filters);

  if (ranked.length === 0) {
    return (
      <div className="screen">
        <Topbar title="Результат" />
        <EmptyState
          title="Пока ничего не нашли"
          description="Измените параметры поиска — мы не будем показывать случайное место только ради результата."
          actionHref="/"
          actionLabel="Изменить параметры"
        />
      </div>
    );
  }

  const place = ranked[index % ranked.length];
  const nextIndex = (index + 1) % ranked.length;
  const base = filtersToSearchParams(filters);

  return (
    <div className="screen">
      <Topbar title="Лучший вариант" />

      <div className="place-visual">
        <div className="visual-lines" />
        <div className="visual-tag">{place.match}%</div>
        <div className="visual-word">{place.accent}</div>
      </div>

      <section className="result-copy">
        <div className="eyebrow">{place.category}</div>
        <h1>{place.name}</h1>
        <div className="match">
          <Sparkles width={20} />
          <span>Подходит вам на <strong>{place.match}%</strong></span>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><Users /> {filters.party} человека</div>
        <div className="stat"><Wallet /> ≈ {place.price.toLocaleString("ru-RU")} ₽ / чел</div>
        <div className="stat"><Clock /> Открыто до {place.closesAt}</div>
        <div className="stat"><Navigation /> {place.travelMinutes} минут от вас</div>
      </div>

      <div className="button-row bottom-action">
        <Link className="primary-button" href={`/place/${place.id}?${base.toString()}`}>
          Идём!
        </Link>
        <Link className="secondary-button" href={`/result?${base.toString()}&i=${nextIndex}`}>
          Другой вариант
        </Link>
      </div>
    </div>
  );
}
