import { Topbar } from "@/components/topbar";
import { SharePlanButton } from "@/components/share-plan-button";
import { getPlace } from "@/lib/recommend";

type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };
export default async function PlanPage({ searchParams }: Props) {
  const sp = await searchParams;
  const id = typeof sp.place === "string" ? sp.place : "brosko-bowling";
  const place = getPlace(id) ?? getPlace("brosko-bowling")!;
  const party = Number(typeof sp.party === "string" ? sp.party : 4) || 4;
  const total = (place.price + 850 + 950) * party;
  const items = [
    { time: "19:00", title: "Ужин", price: 850 },
    { time: "20:30", title: place.name, price: place.price },
    { time: "22:30", title: "Финальная точка", price: 950 },
  ];
  return <div className="screen"><Topbar title="План на вечер"/><div className="plan-summary"><span>Хабаровск</span><span className="dot">•</span><span>{party} человека</span><span className="dot">•</span><span>≈ {total.toLocaleString("ru-RU")} ₽</span></div><div className="timeline">{items.map((item) => <article className="timeline-item" key={item.time}><div className="timeline-time">{item.time}</div><div className="timeline-title">{item.title}</div><div className="timeline-price">≈ {item.price.toLocaleString("ru-RU")} ₽ на человека</div></article>)}</div><SharePlanButton placeName={place.name}/></div>;
}
