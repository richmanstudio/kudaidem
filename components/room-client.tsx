"use client";
import { useMemo, useState } from "react";
import { Heart, Share, X } from "./icons";
import { haptic } from "./telegram-bridge";

const options = ["Brosko Bowling", "DOM"];
export function RoomClient({ initialPlace }: { initialPlace: string }) {
  const ordered = useMemo(() => [initialPlace, ...options.filter((x) => x !== initialPlace)].slice(0,2), [initialPlace]);
  const [votes, setVotes] = useState<Record<string, boolean | undefined>>({});
  const yesCount = Object.values(votes).filter(Boolean).length;
  const vote = (place: string, value: boolean) => { haptic(); setVotes((v) => ({...v, [place]: value})); };
  const share = () => { haptic("medium"); const text = "Заходи в комнату «Куда идём?» и проголосуй за место"; window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`, "_blank"); };
  return <><div className="vote-summary">{Math.max(3, yesCount + 2)} из 4 совпали</div>{ordered.map((place, idx) => <article className="vote-card" key={place}><h2>{place}</h2><div className="subline">{idx === 0 ? "Развлечения · Компания" : "Ресторан · Бар"}</div><div className="vote-actions"><button className={`yes ${votes[place] === true ? "active" : ""}`} onClick={() => vote(place,true)}><Heart width={20}/> Хочу</button><button className={votes[place] === false ? "active" : ""} onClick={() => vote(place,false)}><X width={20}/> Нет</button></div></article>)}<div className="bottom-action"><button className="primary-button" onClick={share}><Share/> Пригласить друзей</button></div></>;
}
