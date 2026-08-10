import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Clock, Navigation, Sparkles, Users, Wallet } from "@/components/icons";
import { rankPlaces } from "@/lib/recommend";
import type { Budget, Mood } from "@/lib/types";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ResultPage({ searchParams }: Props) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" ? sp.city : "Хабаровск";
  const party = Number(typeof sp.party === "string" ? sp.party : 4) || 4;
  const mood = (typeof sp.mood === "string" ? sp.mood : "fun") as Mood;
  const budget = (typeof sp.budget === "string" ? sp.budget : "mid") as Budget;
  const index = Math.max(0, Number(typeof sp.i === "string" ? sp.i : 0) || 0);
  const ranked = rankPlaces({ city, party, mood, budget });
  const place = ranked[index % ranked.length];
  const nextIndex = (index + 1) % ranked.length;
  const base = new URLSearchParams({ city, party: String(party), mood, budget });

  return <div className="screen">
    <Topbar title="Лучший вариант" />
    <div className="place-visual"><div className="visual-lines"/><div className="visual-tag">{place.match}%</div><div className="visual-word">{place.accent}</div></div>
    <section className="result-copy"><div className="eyebrow">{place.category}</div><h1>{place.name}</h1><div className="match"><Sparkles width={20}/><span>Подходит вам на <strong>{place.match}%</strong></span></div></section>
    <div className="stats"><div className="stat"><Users/> {party} человека</div><div className="stat"><Wallet/> ≈ {place.price.toLocaleString("ru-RU")} ₽ / чел</div><div className="stat"><Clock/> Открыто до {place.closesAt}</div><div className="stat"><Navigation/> {place.travelMinutes} минут от вас</div></div>
    <div className="button-row bottom-action"><Link className="primary-button" href={`/place/${place.id}?${base.toString()}`}>Идём!</Link><Link className="secondary-button" href={`/result?${base.toString()}&i=${nextIndex}`}>Другой вариант</Link></div>
  </div>;
}
