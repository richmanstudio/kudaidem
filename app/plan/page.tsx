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
  const total = (place.price + 850 + 950) * filters.party;
  const items = [
    { time: "19:00", title: "Ужин", price: 850 },
    { time: "20:30", title: place.name, price: place.price },
    { time: "22:30", title: "Финальная точка", price: 950 },
  ];

  return (
    <div className="screen">
      <Topbar title="План на вечер" />

      <div className="plan-summary">
        <span>{filters.city}</span>
        <span className="dot">•</span>
        <span>{filters.party} человека</span>
        <span className="dot">•</span>
        <span>≈ {total.toLocaleString("ru-RU")} ₽</span>
      </div>

      <div className="timeline">
        {items.map((item) => (
          <article className="timeline-item" key={item.time}>
            <div className="timeline-time">{item.time}</div>
            <div className="timeline-title">{item.title}</div>
            <div className="timeline-price">
              ≈ {item.price.toLocaleString("ru-RU")} ₽ на человека
            </div>
          </article>
        ))}
      </div>

      <SharePlanButton placeName={place.name} />
    </div>
  );
}
