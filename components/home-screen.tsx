"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "./icons";
import { haptic } from "./telegram-bridge";
import type { Budget, Mood } from "@/lib/types";

const moodLabels: Record<Mood, string> = { eat: "Поесть", fun: "Развлечься", calm: "Спокойно", active: "Активно", surprise: "Удиви меня" };
const budgetLabels: Record<Budget, string> = { low: "до 1 000 ₽", mid: "1 000 – 2 500 ₽", high: "2 500+ ₽" };

export function HomeScreen() {
  const router = useRouter();
  const [party, setParty] = useState(4);
  const [mood, setMood] = useState<Mood>("fun");
  const [budget, setBudget] = useState<Budget>("mid");

  const go = (surprise = false) => {
    haptic("medium");
    const params = new URLSearchParams({ city: "Хабаровск", party: String(party), mood: surprise ? "surprise" : mood, budget });
    router.push(`/result?${params.toString()}`);
  };

  return <div className="screen">
    <section className="hero"><h1>Куда идём?</h1><p>Подберём одно хорошее место для вашего вечера.</p></section>
    <section className="form-stack">
      <div className="field"><label className="label" htmlFor="city">Город</label><div className="select-wrap"><select id="city" className="control" defaultValue="Хабаровск"><option>Хабаровск</option></select><ChevronDown /></div></div>
      <div className="field"><span className="label">Сколько вас?</span><div className="segmented" aria-label="Количество человек">{[2,3,4,5].map((n) => <button key={n} type="button" className={party === n ? "active" : ""} onClick={() => { haptic(); setParty(n); }}>{n === 5 ? "5+" : n}</button>)}</div></div>
      <div className="field"><label className="label" htmlFor="mood">Что хочется?</label><div className="select-wrap"><select id="mood" className="control" value={mood} onChange={(e) => setMood(e.target.value as Mood)}>{Object.entries(moodLabels).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><ChevronDown /></div></div>
      <div className="field"><label className="label" htmlFor="budget">Бюджет на человека</label><div className="select-wrap"><select id="budget" className="control" value={budget} onChange={(e) => setBudget(e.target.value as Budget)}>{Object.entries(budgetLabels).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><ChevronDown /></div></div>
    </section>
    <div className="bottom-action button-row"><button className="primary-button" onClick={() => go(false)}>Найти место <ArrowRight /></button><button className="secondary-button" onClick={() => go(true)}>Решить за нас</button><div className="notice">MVP-каталог Хабаровска. Другие города подключаются следующим этапом.</div></div>
  </div>;
}
