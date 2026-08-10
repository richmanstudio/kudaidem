import { EmptyState } from "@/components/ui/screen-state";
import { Topbar } from "@/components/ui/topbar";
import { SharePlanButton } from "@/features/plans/components/share-plan-button";
import { getPlace } from "@/features/recommendations/domain/recommend";
import { parseSearchRecord } from "@/features/recommendations/domain/search-params";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlanPage({ searchParams }: Props) {
  const raw = await searchParams;
  const id = typeof raw.place === "string" ? raw.place : undefined;

  if (!id) {
    return (
      <div className="screen">
        <Topbar title="План на вечер" />
        <EmptyState
          title="Сначала выберите место"
          description="План строится вокруг выбранной основной точки вечера."
          actionHref="/"
          actionLabel="Подобрать место"
        />
      </div>
    );
  }

  const place = getPlace(id);

  if (!place) {
    return (
      <div className="screen">
        <Topbar title="План на вечер" />
        <EmptyState
          title="Место больше недоступно"
          description="Вернитесь к подбору — мы предложим другой вариант."
          actionHref="/"
          actionLabel="Новый подбор"
        />
      </div>
    );
  }

  const filters = parseSearchRecord(raw);

  return (
    <div className="screen">
      <Topbar title="План на вечер" />

      <div className="plan-summary">
        <span>{filters.city}</span>
        <span className="dot">•</span>
        <span>{filters.party} человека</span>
        {place.price != null ? (
          <>
            <span className="dot">•</span>
            <span>≈ {(place.price * filters.party).toLocaleString("ru-RU")} ₽ на компанию</span>
          </>
        ) : null}
      </div>

      <div className="timeline">
        <article className="timeline-item">
          <div className="timeline-time">Основная точка</div>
          <div className="timeline-title">{place.name}</div>
          <div className="timeline-price">
            {place.price != null
              ? `≈ ${place.price.toLocaleString("ru-RU")} ₽ на человека`
              : "Стоимость уточняется у заведения"}
          </div>
        </article>
      </div>

      <div className="notice">
        Полный маршрут из нескольких проверенных точек будет добавлен на отдельном этапе. Здесь не используются вымышленные цены или места.
      </div>

      <SharePlanButton placeName={place.name} />
    </div>
  );
}
