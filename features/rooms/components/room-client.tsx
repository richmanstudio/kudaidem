"use client";

import { useMemo, useState } from "react";
import { Heart, Share, X } from "@/components/ui/icons";
import { haptic, shareToTelegram } from "@/lib/telegram/client";

const demoOptions = ["Brosko Bowling", "DOM"];
const demoRoomSize = 4;
const demoExistingMatches = 2;

export function RoomClient({ initialPlace }: { initialPlace: string }) {
  const ordered = useMemo(
    () => [initialPlace, ...demoOptions.filter((option) => option !== initialPlace)].slice(0, 2),
    [initialPlace],
  );
  const [votes, setVotes] = useState<Record<string, boolean | undefined>>({});

  const yesCount = Object.values(votes).filter((vote) => vote === true).length;
  const displayedMatches = Math.min(demoRoomSize, demoExistingMatches + yesCount);

  const vote = (place: string, value: boolean) => {
    haptic();
    setVotes((current) => ({ ...current, [place]: value }));
  };

  const share = () => {
    haptic("medium");
    shareToTelegram(
      window.location.href,
      "Заходи в комнату «Куда идём?» и проголосуй за место",
    );
  };

  return (
    <>
      <div className="vote-summary" aria-live="polite">
        {displayedMatches} из {demoRoomSize} совпали
      </div>

      {ordered.map((place, index) => (
        <article className="vote-card" key={place}>
          <h2>{place}</h2>
          <div className="subline">
            {index === 0 ? "Развлечения · Компания" : "Ресторан · Бар"}
          </div>
          <div className="vote-actions">
            <button
              type="button"
              className={`yes ${votes[place] === true ? "active" : ""}`}
              aria-pressed={votes[place] === true}
              onClick={() => vote(place, true)}
            >
              <Heart width={20} /> Хочу
            </button>
            <button
              type="button"
              className={votes[place] === false ? "active no" : ""}
              aria-pressed={votes[place] === false}
              onClick={() => vote(place, false)}
            >
              <X width={20} /> Нет
            </button>
          </div>
        </article>
      ))}

      <div className="bottom-action">
        <button className="primary-button" type="button" onClick={share}>
          <Share /> Пригласить друзей
        </button>
      </div>
    </>
  );
}
