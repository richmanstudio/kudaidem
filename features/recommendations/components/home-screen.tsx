"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Navigation } from "@/components/ui/icons";
import { haptic } from "@/lib/telegram/client";
import { useLiveLocation } from "@/lib/location/use-live-location";
import {
  filtersToSearchParams,
  DEFAULT_FILTERS,
} from "@/features/recommendations/domain/search-params";
import type { Budget, Mood } from "@/features/recommendations/domain/types";

const moodLabels: Record<Mood, string> = {
  eat: "Поесть",
  fun: "Развлечься",
  calm: "Спокойно",
  active: "Активно",
  surprise: "Удиви меня",
};

const budgetLabels: Record<Budget, string> = {
  low: "до 1 000 ₽",
  mid: "1 000 – 2 500 ₽",
  high: "2 500+ ₽",
};

export function HomeScreen() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [party, setParty] = useState(DEFAULT_FILTERS.party);
  const [mood, setMood] = useState<Mood>(DEFAULT_FILTERS.mood);
  const [budget, setBudget] = useState<Budget>(DEFAULT_FILTERS.budget);
  const geo = useLiveLocation();

  const go = (surprise = false) => {
    haptic("medium");

    const query = filtersToSearchParams({
      city: DEFAULT_FILTERS.city,
      party,
      mood: surprise ? "surprise" : mood,
      budget,
      at: new Date().toISOString(),
      latitude: geo.location?.latitude,
      longitude: geo.location?.longitude,
      maxDistanceKm: geo.location ? 12 : undefined,
    });

    startTransition(() => {
      router.push(`/result?${query.toString()}`);
    });
  };

  const handleLocation = async () => {
    haptic();
    if (geo.location) {
      geo.clear();
      return;
    }
    if (geo.permission === "denied") {
      await geo.openSettings();
      return;
    }
    await geo.request();
  };

  const accuracy = geo.location?.accuracyM != null
    ? ` · ±${Math.max(100, geo.location.accuracyM)} м`
    : "";

  return (
    <div className="screen">
      <section className="hero">
        <h1>Куда идём?</h1>
        <p>Подберём одно хорошее место для вашего вечера.</p>
      </section>

      <section className="form-stack">
        <div className="field">
          <label className="label" htmlFor="city">Город</label>
          <div className="select-wrap">
            <select id="city" className="control" value="Хабаровск" disabled aria-describedby="city-note">
              <option>Хабаровск</option>
            </select>
            <ChevronDown />
          </div>
          <span className="sr-only" id="city-note">На первом запуске доступен Хабаровск</span>
          <button
            className="match"
            type="button"
            disabled={geo.isRequesting || geo.permission === "unavailable"}
            onClick={() => void handleLocation()}
          >
            <Navigation width={18} />
            <span>
              {geo.isRequesting
                ? "Определяем геопозицию…"
                : geo.location
                  ? `Геопозиция включена${accuracy} · отключить`
                  : geo.permission === "denied"
                    ? "Разрешить геопозицию в настройках"
                    : geo.permission === "unavailable"
                      ? "Геопозиция недоступна"
                      : "Учитывать, где я"}
            </span>
          </button>
          {geo.message && <div className="notice">{geo.message}</div>}
        </div>

        <div className="field">
          <span className="label">Сколько вас?</span>
          <div className="segmented" aria-label="Количество человек">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={party === n ? "active" : ""}
                aria-pressed={party === n}
                onClick={() => {
                  haptic();
                  setParty(n);
                }}
              >
                {n === 5 ? "5+" : n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="mood">Что хочется?</label>
          <div className="select-wrap">
            <select
              id="mood"
              className="control"
              value={mood}
              onChange={(event) => {
                haptic();
                setMood(event.target.value as Mood);
              }}
            >
              {Object.entries(moodLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="budget">Бюджет на человека</label>
          <div className="select-wrap">
            <select
              id="budget"
              className="control"
              value={budget}
              onChange={(event) => {
                haptic();
                setBudget(event.target.value as Budget);
              }}
            >
              {Object.entries(budgetLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>
      </section>

      <div className="bottom-action button-row">
        <button className="primary-button" type="button" disabled={isPending} onClick={() => go(false)}>
          {isPending ? "Подбираем…" : "Найти место"} {!isPending && <ArrowRight />}
        </button>
        <button className="secondary-button" type="button" disabled={isPending} onClick={() => go(true)}>
          Решить за нас
        </button>
        <div className="notice">Учитываем текущее время, погоду, открытые места и расстояние — если вы разрешили геопозицию.</div>
      </div>
    </div>
  );
}
