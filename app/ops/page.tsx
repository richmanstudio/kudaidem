import { notFound } from "next/navigation";
import { dashboardSnapshot } from "@/features/analytics/server/analytics";

export const dynamic = "force-dynamic";

export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const token = typeof raw.token === "string" ? raw.token : "";
  if (!process.env.OPS_DASHBOARD_TOKEN || token !== process.env.OPS_DASHBOARD_TOKEN) notFound();
  const data = await dashboardSnapshot(7);
  const f = data.funnel;
  return <div className="screen">
    <div className="eyebrow">DUONIQ · Stage 7</div>
    <h1>Beta dashboard</h1>
    <p className="subline">Последние 7 дней · уникальных сессий: {data.sessions}</p>
    <div className="stats">
      <div className="stat">Открытия · {f.open}</div>
      <div className="stat">Поиски · {f.search}</div>
      <div className="stat">Показы · {f.shown}</div>
      <div className="stat">Выбрали · {f.accepted}</div>
      <div className="stat">Маршруты · {f.routed}</div>
    </div>
    <section className="result-copy">
      <h2>Воронка</h2>
      <p>Open → Search: <strong>{f.openToSearch}%</strong></p>
      <p>Shown → Accept: <strong>{f.shownToAccept}%</strong></p>
      <p>Accept → Route: <strong>{f.acceptToRoute}%</strong></p>
    </section>
    <section className="result-copy">
      <h2>Последний feedback</h2>
      {data.feedback.length ? data.feedback.map((item) => <article key={item.id} className="notice">{item.rating ? `${item.rating}/5 · ` : ""}{item.message}</article>) : <p className="subline">Пока нет отзывов.</p>}
    </section>
  </div>;
}
